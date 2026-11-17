package oasdiff

import (
	"encoding/json"
	"strings"
	"testing"

	"diffora/comparison-service/internal/model"
)

func TestSanitizeDropsFileAndFingerprint(t *testing.T) {
	raw := `[{"id":"api-deprecated","text":"API GET /pets is deprecated","level":2,"operation":"GET","path":"/pets","section":"paths","revisionSource":{"file":"C:\\secret\\target.yaml","line":10,"column":4},"fingerprint":"abc123"}]`
	findings, err := Sanitize([]byte(raw))
	if err != nil {
		t.Fatalf("Sanitize: %v", err)
	}
	if len(findings) != 1 {
		t.Fatalf("expected 1 finding, got %d", len(findings))
	}
	finding := findings[0]
	if finding.LevelName != "warning" {
		t.Fatalf("unexpected level name: %q", finding.LevelName)
	}
	if finding.Line == nil || *finding.Line != 10 {
		t.Fatalf("line was not preserved: %#v", finding)
	}

	encoded, err := json.Marshal(finding)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(encoded), "secret") || strings.Contains(string(encoded), "fingerprint") {
		t.Fatalf("sensitive data leaked: %s", encoded)
	}
}

func TestMessageFromFindings(t *testing.T) {
	line := 12
	message := MessageFromFindings([]model.Finding{{Text: "Operation is invalid.", Line: &line}}, "fallback")
	if message != "Operation is invalid. (line 12)" {
		t.Fatalf("unexpected message: %q", message)
	}
}
