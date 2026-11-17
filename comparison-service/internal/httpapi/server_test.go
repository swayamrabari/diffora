package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"diffora/comparison-service/internal/config"
	"diffora/comparison-service/internal/model"
	"diffora/comparison-service/internal/oasdiff"
)

type fakeEngine struct {
	validate     string
	validateExit int
	diff         string
	changelog    string
	summary      string
	breaking     string
}

func (f *fakeEngine) Run(_ context.Context, _ string, _ time.Duration, args ...string) (oasdiff.Result, error) {
	switch args[0] {
	case "validate":
		return oasdiff.Result{Stdout: []byte(f.validate), ExitCode: f.validateExit}, nil
	case "diff":
		return oasdiff.Result{Stdout: []byte(f.diff)}, nil
	case "changelog":
		return oasdiff.Result{Stdout: []byte(f.changelog)}, nil
	case "summary":
		return oasdiff.Result{Stdout: []byte(f.summary)}, nil
	case "breaking":
		return oasdiff.Result{Stdout: []byte(f.breaking)}, nil
	default:
		return oasdiff.Result{ExitCode: 1}, nil
	}
}

func (f *fakeEngine) Version(context.Context) (string, error) {
	return "1.38.0", nil
}

func testConfig() config.Config {
	return config.Config{
		Port:                 "0",
		SharedSecret:         "secret",
		OasdiffBin:           "fake",
		ValidateTimeout:      time.Second,
		DiffTimeout:          time.Second,
		MaxRequestBytes:      1024 * 1024,
		MaxEngineStdoutBytes: 1024 * 1024,
		MaxChanges:           100,
	}
}

func testServer(t *testing.T, engine *fakeEngine) *httptest.Server {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	server := New(testConfig(), engine, "1.38.0", logger)
	return httptest.NewServer(server.Handler())
}

func request(t *testing.T, method, url, secret, contentType string, body []byte) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, url, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if secret != "" {
		req.Header.Set("X-Shared-Secret", secret)
	}
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	return response
}

func TestHealthNeedsNoSecret(t *testing.T) {
	server := testServer(t, &fakeEngine{})
	defer server.Close()

	response := request(t, http.MethodGet, server.URL+"/health", "", "", nil)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}
	body, _ := io.ReadAll(response.Body)
	if !strings.Contains(string(body), "1.38.0") {
		t.Fatalf("unexpected health body: %s", body)
	}
}

func TestValidateRequiresSecret(t *testing.T) {
	server := testServer(t, &fakeEngine{validate: "[]"})
	defer server.Close()

	response := request(t, http.MethodPost, server.URL+"/validate", "", "application/json",
		[]byte(`{"content":"openapi: 3.0.3\ninfo: {title: A, version: 1}\npaths: {}\n","format":"yaml"}`))
	defer response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.StatusCode)
	}
}

func TestValidateSuccess(t *testing.T) {
	server := testServer(t, &fakeEngine{validate: "[]"})
	defer server.Close()

	response := request(t, http.MethodPost, server.URL+"/validate", "secret", "application/json",
		[]byte(`{"content":"openapi: 3.0.3\ninfo: {title: A, version: 1}\npaths: {}\n","format":"yaml"}`))
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.StatusCode, body)
	}
	var payload model.ValidateResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !payload.Valid || payload.EngineVersion != "1.38.0" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
}

func TestValidateInvalidSpec(t *testing.T) {
	server := testServer(t, &fakeEngine{
		validate:     `[{"text":"operation is invalid","level":3,"revisionSource":{"file":"C:\\secret\\spec.yaml","line":7}}]`,
		validateExit: 1,
	})
	defer server.Close()

	response := request(t, http.MethodPost, server.URL+"/validate", "secret", "application/json",
		[]byte(`{"content":"openapi: 3.0.3\ninfo: {title: A, version: 1}\npaths: {}\n","format":"yaml"}`))
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.StatusCode, body)
	}
	if !strings.Contains(string(body), "operation is invalid (line 7)") {
		t.Fatalf("unexpected error body: %s", body)
	}
	if strings.Contains(string(body), "secret") {
		t.Fatalf("file path leaked: %s", body)
	}
}

func TestDiffSuccess(t *testing.T) {
	engine := &fakeEngine{
		diff:      `{"paths":{"modified":{"/pets":{"operations":{"modified":{"GET":{"deprecated":{"from":false,"to":true}}}}}}}}`,
		changelog: `[{"id":"api-deprecated","text":"API GET /pets is deprecated","level":2,"operation":"GET","path":"/pets","section":"paths","revisionSource":{"file":"C:\\secret\\target.yaml","line":10,"column":4},"fingerprint":"abc"}]`,
		summary:   `{"diff":true,"details":{"endpoints":{"modified":1}}}`,
		breaking:  `[]`,
	}
	server := testServer(t, engine)
	defer server.Close()

	body := []byte(`{
		"base":{"content":"{\"openapi\":\"3.0.3\",\"info\":{\"title\":\"Pets\",\"version\":\"1\"},\"paths\":{}}","format":"json"},
		"target":{"content":"{\"openapi\":\"3.0.3\",\"info\":{\"title\":\"Pets\",\"version\":\"2\"},\"paths\":{}}","format":"json"}
	}`)
	response := request(t, http.MethodPost, server.URL+"/diff", "secret", "application/json", body)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.StatusCode, payload)
	}

	var payload model.DiffResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Changelog) != 1 || payload.Changelog[0].LevelName != "warning" {
		t.Fatalf("unexpected changelog: %+v", payload.Changelog)
	}
	if payload.Changelog[0].Line == nil || *payload.Changelog[0].Line != 10 {
		t.Fatalf("line was not preserved: %+v", payload.Changelog[0])
	}
	if len(payload.Deprecations) != 1 {
		t.Fatalf("expected one deprecation, got %+v", payload.Deprecations)
	}
	if payload.Deprecations[0].Pointer != "/paths/~1pets/get/deprecated" {
		t.Fatalf("unexpected deprecation pointer: %+v", payload.Deprecations[0])
	}
	if !strings.Contains(string(payload.Summary), "endpoints") {
		t.Fatalf("unexpected summary: %s", payload.Summary)
	}

	encoded, _ := json.Marshal(payload)
	if strings.Contains(string(encoded), "secret") || strings.Contains(string(encoded), "fingerprint") {
		t.Fatalf("sensitive data leaked: %s", encoded)
	}
}

func TestDiffRejectsMixedFormats(t *testing.T) {
	server := testServer(t, &fakeEngine{})
	defer server.Close()

	body := []byte(`{
		"base":{"content":"{}","format":"json"},
		"target":{"content":"openapi: 3.0.3\ninfo: {title: A, version: 1}\n","format":"yaml"}
	}`)
	response := request(t, http.MethodPost, server.URL+"/diff", "secret", "application/json", body)
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.StatusCode)
	}
	var payload model.ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.Error.Code != "FORMAT_MISMATCH" {
		t.Fatalf("unexpected error: %+v", payload)
	}
}

func TestDiffRejectsMissingContent(t *testing.T) {
	server := testServer(t, &fakeEngine{})
	defer server.Close()

	response := request(t, http.MethodPost, server.URL+"/diff", "secret", "application/json",
		[]byte(`{"base":{"content":"","format":"json"},"target":{"content":"{}","format":"json"}}`))
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.StatusCode)
	}
}

func TestRequestContentType(t *testing.T) {
	server := testServer(t, &fakeEngine{})
	defer server.Close()

	response := request(t, http.MethodPost, server.URL+"/validate", "secret", "text/plain",
		[]byte(`{"content":"{}","format":"json"}`))
	defer response.Body.Close()
	if response.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("expected 415, got %d", response.StatusCode)
	}
}

func TestRequestBodyBOM(t *testing.T) {
	server := testServer(t, &fakeEngine{validate: "[]"})
	defer server.Close()

	body := []byte(`{"content":"openapi: 3.0.3\ninfo: {title: A, version: 1}\npaths: {}\n","format":"yaml"}`)
	body = append([]byte{0xEF, 0xBB, 0xBF}, body...)
	response := request(t, http.MethodPost, server.URL+"/validate", "secret", "application/json", body)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.StatusCode, payload)
	}
}

func TestRequestBodyTooLarge(t *testing.T) {
	cfg := testConfig()
	cfg.MaxRequestBytes = 16
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	server := httptest.NewServer(New(cfg, &fakeEngine{}, "1.38.0", logger).Handler())
	defer server.Close()

	response := request(t, http.MethodPost, server.URL+"/validate", "secret", "application/json",
		[]byte(`{"content":"openapi: 3.0.3\ninfo: {title: A, version: 1}\npaths: {}\n","format":"yaml"}`))
	defer response.Body.Close()
	if response.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", response.StatusCode)
	}
}
