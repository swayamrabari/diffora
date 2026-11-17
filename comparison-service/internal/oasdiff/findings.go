package oasdiff

import (
	"encoding/json"
	"fmt"
	"strings"

	"diffora/comparison-service/internal/model"
)

type rawFinding struct {
	ID             string     `json:"id"`
	Text           string     `json:"text"`
	Level          int        `json:"level"`
	Operation      string     `json:"operation"`
	OperationID    string     `json:"operationId"`
	Path           string     `json:"path"`
	Section        string     `json:"section"`
	RevisionSource *rawSource `json:"revisionSource"`
	BaseSource     *rawSource `json:"baseSource"`
	Fingerprint    string     `json:"fingerprint"`
}

type rawSource struct {
	File      string `json:"file"`
	Line      int    `json:"line"`
	Column    int    `json:"column"`
	EndLine   int    `json:"endLine"`
	EndColumn int    `json:"endColumn"`
}

// Sanitize turns engine findings into the public shape. File paths and
// fingerprints are deliberately dropped.
func Sanitize(data []byte) ([]model.Finding, error) {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" {
		return []model.Finding{}, nil
	}

	var raw []rawFinding
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	findings := make([]model.Finding, 0, len(raw))
	for _, item := range raw {
		finding := model.Finding{
			ID:          item.ID,
			Text:        item.Text,
			Level:       item.Level,
			LevelName:   LevelName(item.Level),
			Operation:   item.Operation,
			OperationID: item.OperationID,
			Path:        item.Path,
			Section:     item.Section,
		}
		source := item.RevisionSource
		if source == nil {
			source = item.BaseSource
		}
		if source != nil {
			if source.Line > 0 {
				line := source.Line
				finding.Line = &line
			}
			if source.Column > 0 {
				column := source.Column
				finding.Column = &column
			}
			if source.EndLine > 0 {
				endLine := source.EndLine
				finding.EndLine = &endLine
			}
			if source.EndColumn > 0 {
				endColumn := source.EndColumn
				finding.EndColumn = &endColumn
			}
		}
		findings = append(findings, finding)
	}
	return findings, nil
}

func LevelName(level int) string {
	switch level {
	case 1:
		return "info"
	case 2:
		return "warning"
	case 3:
		return "error"
	default:
		return "unknown"
	}
}

// MessageFromFindings returns one user-safe validation message.
func MessageFromFindings(findings []model.Finding, fallback string) string {
	if len(findings) == 0 {
		return fallback
	}
	first := findings[0]
	message := first.Text
	if first.Line != nil {
		message = fmt.Sprintf("%s (line %d)", message, *first.Line)
	}
	if len(message) > 500 {
		message = message[:500]
	}
	return message
}
