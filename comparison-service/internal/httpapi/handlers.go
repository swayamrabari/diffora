package httpapi

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"diffora/comparison-service/internal/diffchange"
	"diffora/comparison-service/internal/model"
	"diffora/comparison-service/internal/oasdiff"
	"diffora/comparison-service/internal/specdoc"
)

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, model.HealthResponse{
		Status:        "ok",
		EngineVersion: s.engineVersion,
	})
}

func (s *Server) handleValidate(w http.ResponseWriter, r *http.Request) {
	var request model.ValidateRequest
	if err := decodeJSON(w, r, s.cfg.MaxRequestBytes, &request); err != nil {
		s.writeDecodeError(w, err)
		return
	}
	if strings.TrimSpace(request.Content) == "" || !validFormat(request.Format) {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "content and format (yaml or json) are required.")
		return
	}

	dir, cleanup, err := tempDir()
	if err != nil {
		s.logger.Error("temp dir", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "An unexpected error occurred.")
		return
	}
	defer cleanup()

	file := "input." + extension(request.Format)
	if err := writeInputFile(dir, file, stripBOM(request.Content)); err != nil {
		s.logger.Error("write spec", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "An unexpected error occurred.")
		return
	}

	result, err := s.engine.Run(r.Context(), dir, s.cfg.ValidateTimeout,
		"validate", file, "-f", "json", "--allow-external-refs=false")
	if err != nil {
		s.logger.Error("validate run", "error", err)
		writeError(w, http.StatusInternalServerError, "ENGINE_FAILED", "The validation engine failed.")
		return
	}
	if result.TimedOut {
		writeError(w, http.StatusGatewayTimeout, "TIMEOUT", "The validation engine timed out.")
		return
	}
	if result.StdoutTruncated {
		writeError(w, http.StatusUnprocessableEntity, "OUTPUT_TOO_LARGE", "The validation output was too large.")
		return
	}

	switch result.ExitCode {
	case 0:
		writeJSON(w, http.StatusOK, model.ValidateResponse{
			Valid:         true,
			EngineVersion: s.engineVersion,
		})
	case 123:
		writeError(w, http.StatusUnprocessableEntity,
			"EXTERNAL_REF_NOT_SUPPORTED", "External references are not supported.")
	case 1, 102:
		findings, parseErr := oasdiff.Sanitize(result.Stdout)
		message := "The spec did not pass validation."
		if parseErr == nil {
			message = oasdiff.MessageFromFindings(findings, message)
		}
		writeError(w, http.StatusUnprocessableEntity, "INVALID_SPEC", message)
	default:
		writeError(w, http.StatusInternalServerError, "ENGINE_FAILED", "The validation engine failed.")
	}
}

func (s *Server) handleDiff(w http.ResponseWriter, r *http.Request) {
	var request model.DiffRequest
	if err := decodeJSON(w, r, s.cfg.MaxRequestBytes, &request); err != nil {
		s.writeDecodeError(w, err)
		return
	}
	if strings.TrimSpace(request.Base.Content) == "" ||
		strings.TrimSpace(request.Target.Content) == "" ||
		!validFormat(request.Base.Format) ||
		!validFormat(request.Target.Format) {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST",
			"base and target content and format (yaml or json) are required.")
		return
	}
	if !strings.EqualFold(request.Base.Format, request.Target.Format) {
		writeError(w, http.StatusBadRequest, "FORMAT_MISMATCH",
			"Both versions must use the same format: yaml or json.")
		return
	}

	format := strings.ToLower(request.Base.Format)
	baseFile := "base." + extension(format)
	targetFile := "target." + extension(format)

	baseDoc, err := specdoc.Parse(request.Base.Content, request.Base.Format)
	if err != nil {
		s.logger.Error("parse base document", "error", err)
		writeError(w, http.StatusUnprocessableEntity, "INVALID_SPEC", "The base spec could not be processed.")
		return
	}
	targetDoc, err := specdoc.Parse(request.Target.Content, request.Target.Format)
	if err != nil {
		s.logger.Error("parse target document", "error", err)
		writeError(w, http.StatusUnprocessableEntity, "INVALID_SPEC", "The target spec could not be processed.")
		return
	}

	dir, cleanup, err := tempDir()
	if err != nil {
		s.logger.Error("temp dir", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "An unexpected error occurred.")
		return
	}
	defer cleanup()

	if err := writeInputFile(dir, baseFile, stripBOM(request.Base.Content)); err != nil {
		s.logger.Error("write base", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "An unexpected error occurred.")
		return
	}
	if err := writeInputFile(dir, targetFile, stripBOM(request.Target.Content)); err != nil {
		s.logger.Error("write target", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL", "An unexpected error occurred.")
		return
	}

	start := time.Now()
	result, err := s.engine.Run(r.Context(), dir, s.cfg.DiffTimeout,
		"diff", baseFile, targetFile, "-f", "json", "--allow-external-refs=false")
	if err != nil {
		s.logger.Error("diff run", "error", err)
		writeError(w, http.StatusInternalServerError, "ENGINE_FAILED", "The comparison engine failed.")
		return
	}
	durationMs := time.Since(start).Milliseconds()

	if result.TimedOut {
		writeError(w, http.StatusGatewayTimeout, "TIMEOUT", "The comparison engine timed out.")
		return
	}
	if result.StdoutTruncated {
		writeError(w, http.StatusUnprocessableEntity, "OUTPUT_TOO_LARGE", "The comparison output was too large.")
		return
	}
	switch result.ExitCode {
	case 0:
	case 123:
		writeError(w, http.StatusUnprocessableEntity,
			"EXTERNAL_REF_NOT_SUPPORTED", "External references are not supported.")
		return
	case 1, 102:
		writeError(w, http.StatusUnprocessableEntity, "INVALID_SPEC",
			"One of the specs could not be compared.")
		return
	default:
		writeError(w, http.StatusInternalServerError, "ENGINE_FAILED", "The comparison engine failed.")
		return
	}

	var diffObject map[string]any
	if err := json.Unmarshal(result.Stdout, &diffObject); err != nil || diffObject == nil {
		s.logger.Error("parse diff", "error", err)
		writeError(w, http.StatusInternalServerError, "ENGINE_FAILED", "The engine returned an invalid diff.")
		return
	}

	changes := diffchange.Build(diffObject, baseDoc, targetDoc)
	if changes == nil {
		changes = []model.DiffChange{}
	}
	if len(changes) > s.cfg.MaxChanges {
		writeError(w, http.StatusUnprocessableEntity, "TOO_MANY_CHANGES",
			"The comparison contains too many changes.")
		return
	}

	response := model.DiffResponse{
		EngineVersion: s.engineVersion,
		DurationMs:    durationMs,
		Changes:       changes,
	}
	writeJSON(w, http.StatusOK, response)
}

func validFormat(value string) bool {
	return strings.EqualFold(value, "yaml") || strings.EqualFold(value, "json")
}

func extension(format string) string {
	if strings.EqualFold(format, "json") {
		return "json"
	}
	return "yaml"
}

func stripBOM(value string) string {
	return strings.TrimPrefix(value, "\ufeff")
}

func tempDir() (string, func(), error) {
	dir, err := os.MkdirTemp("", "diffora-*")
	if err != nil {
		return "", func() {}, err
	}
	_ = os.Chmod(dir, 0o700)
	return dir, func() { _ = os.RemoveAll(dir) }, nil
}

func writeInputFile(dir, name, content string) error {
	return os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600)
}
