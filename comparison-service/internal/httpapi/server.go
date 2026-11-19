// The HTTP layer: routes, shared-secret auth, logging/recovery middleware,
// and JSON decoding/writing helpers.

package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"time"

	"diffora/comparison-service/internal/config"
	"diffora/comparison-service/internal/model"
	"diffora/comparison-service/internal/oasdiff"
)

type Engine interface {
	Run(ctx context.Context, dir string, timeout time.Duration, args ...string) (oasdiff.Result, error)
	Version(ctx context.Context) (string, error)
}

type Server struct {
	cfg           config.Config
	engine        Engine
	engineVersion string
	logger        *slog.Logger
}

func New(cfg config.Config, engine Engine, engineVersion string, logger *slog.Logger) *Server {
	return &Server{
		cfg:           cfg,
		engine:        engine,
		engineVersion: engineVersion,
		logger:        logger,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.Handle("POST /validate", s.withAuth(http.HandlerFunc(s.handleValidate)))
	mux.Handle("POST /diff", s.withAuth(http.HandlerFunc(s.handleDiff)))

	return s.withRecovery(s.withLogging(mux))
}

func (s *Server) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provided := r.Header.Get("X-Shared-Secret")
		if !secureCompare(provided, s.cfg.SharedSecret) {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "A valid shared secret is required.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func secureCompare(provided, expected string) bool {
	if expected == "" {
		return false
	}
	providedHash := sha256.Sum256([]byte(provided))
	expectedHash := sha256.Sum256([]byte(expected))
	return subtle.ConstantTimeCompare(providedHash[:], expectedHash[:]) == 1
}

func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(recorder, r)
		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}
		s.logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

func (s *Server) withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("panic", "error", recovered)
				writeError(w, http.StatusInternalServerError, "INTERNAL", "An unexpected error occurred.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(data []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(data)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, model.ErrorResponse{
		Error: model.APIError{Code: code, Message: message},
	})
}

var (
	errBodyTooLarge     = errors.New("body too large")
	errUnsupportedMedia = errors.New("unsupported media type")
	errInvalidBody      = errors.New("invalid body")
)

func decodeJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, destination any) error {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		return errUnsupportedMedia
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	reader := bufio.NewReader(r.Body)
	if prefix, err := reader.Peek(3); err == nil && bytes.Equal(prefix, []byte{0xEF, 0xBB, 0xBF}) {
		_, _ = reader.Discard(3)
	}
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(destination); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return errBodyTooLarge
		}
		return errInvalidBody
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return errInvalidBody
	}
	return nil
}

func (s *Server) writeDecodeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errBodyTooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "The request body is too large.")
	case errors.Is(err, errUnsupportedMedia):
		writeError(w, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.")
	default:
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "The request body is not valid JSON.")
	}
}
