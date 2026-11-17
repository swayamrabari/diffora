package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"diffora/comparison-service/internal/model"
	"diffora/comparison-service/internal/oasdiff"
)

func TestPinnedEngineEndToEnd(t *testing.T) {
	bin := os.Getenv("OASDIFF_BIN")
	if bin == "" {
		t.Skip("set OASDIFF_BIN to run the pinned-engine integration test")
	}

	cfg := testConfig()
	cfg.OasdiffBin = bin
	cfg.DiffTimeout = 60 * time.Second
	cfg.ValidateTimeout = 20 * time.Second
	runner := oasdiff.New(bin, cfg.MaxEngineStdoutBytes)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	server := httptest.NewServer(New(cfg, runner, "test", logger).Handler())
	defer server.Close()

	readFixture := func(name, file string) string {
		t.Helper()
		data, err := os.ReadFile(filepath.Join("..", "..", "testdata", "pairs", name, file))
		if err != nil {
			t.Fatalf("read fixture %s/%s: %v", name, file, err)
		}
		return string(data)
	}

	diffBody := map[string]any{
		"base":   map[string]string{"content": readFixture("property-added", "base.yaml"), "format": "yaml"},
		"target": map[string]string{"content": readFixture("property-added", "target.yaml"), "format": "yaml"},
	}
	diffPayload, _ := json.Marshal(diffBody)
	response := request(t, http.MethodPost, server.URL+"/diff", "secret", "application/json", diffPayload)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.StatusCode, body)
	}

	var diff model.DiffResponse
	if err := json.NewDecoder(response.Body).Decode(&diff); err != nil {
		t.Fatalf("decode diff: %v", err)
	}
	if diff.EngineVersion == "" {
		t.Fatal("engine version is empty")
	}
	if len(diff.Changelog) == 0 {
		t.Fatal("expected changelog entries")
	}
	if len(diff.Summary) == 0 {
		t.Fatal("expected a summary")
	}
	if diff.RawDiffText == "" {
		t.Fatal("expected raw diff text")
	}

	deprecationBody := map[string]any{
		"base":   map[string]string{"content": readFixture("operation-metadata", "base.yaml"), "format": "yaml"},
		"target": map[string]string{"content": readFixture("operation-metadata", "target.yaml"), "format": "yaml"},
	}
	deprecationPayload, _ := json.Marshal(deprecationBody)
	deprecationResponse := request(t, http.MethodPost, server.URL+"/diff", "secret", "application/json", deprecationPayload)
	defer deprecationResponse.Body.Close()
	if deprecationResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deprecationResponse.Body)
		t.Fatalf("expected 200 for deprecation fixture, got %d: %s", deprecationResponse.StatusCode, body)
	}
	var deprecationDiff model.DiffResponse
	if err := json.NewDecoder(deprecationResponse.Body).Decode(&deprecationDiff); err != nil {
		t.Fatalf("decode deprecation diff: %v", err)
	}
	if len(deprecationDiff.Deprecations) != 1 {
		t.Fatalf("expected 1 deprecation, got %#v", deprecationDiff.Deprecations)
	}
	if deprecationDiff.Deprecations[0].Pointer != "/paths/~1pets/get/deprecated" {
		t.Fatalf("unexpected deprecation pointer: %#v", deprecationDiff.Deprecations[0])
	}
	if deprecationDiff.Deprecations[0].Path != "/pets" || deprecationDiff.Deprecations[0].Method != "GET" {
		t.Fatalf("unexpected deprecation context: %#v", deprecationDiff.Deprecations[0])
	}

	externalBody := map[string]any{
		"base": map[string]string{
			"content": readFixture("external-ref", "base.yaml"),
			"format":  "yaml",
		},
		"target": map[string]string{
			"content": readFixture("external-ref", "target.yaml"),
			"format":  "yaml",
		},
	}
	externalPayload, _ := json.Marshal(externalBody)
	externalResponse := request(t, http.MethodPost, server.URL+"/diff", "secret", "application/json", externalPayload)
	defer externalResponse.Body.Close()
	if externalResponse.StatusCode != http.StatusUnprocessableEntity {
		body, _ := io.ReadAll(externalResponse.Body)
		t.Fatalf("expected 422 for external refs, got %d: %s", externalResponse.StatusCode, body)
	}
	var externalError model.ErrorResponse
	if err := json.NewDecoder(externalResponse.Body).Decode(&externalError); err != nil {
		t.Fatalf("decode external error: %v", err)
	}
	if externalError.Error.Code != "EXTERNAL_REF_NOT_SUPPORTED" {
		t.Fatalf("unexpected external error: %+v", externalError)
	}
	if bytes.Contains([]byte(externalError.Error.Message), []byte("other.yaml")) {
		t.Fatalf("external ref path leaked: %s", externalError.Error.Message)
	}
}
