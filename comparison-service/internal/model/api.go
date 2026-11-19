// Request and response shapes shared by the HTTP handlers and the engine
// packages. Pointers are json:"-" on purpose: they are internal only.

package model

import "encoding/json"

type SpecInput struct {
	Content string `json:"content"`
	Format  string `json:"format"`
}

type DiffRequest struct {
	Base   SpecInput `json:"base"`
	Target SpecInput `json:"target"`
}

type ValidateRequest struct {
	Content string `json:"content"`
	Format  string `json:"format"`
}

type Finding struct {
	ID          string `json:"id"`
	Text        string `json:"text"`
	Level       int    `json:"level"`
	LevelName   string `json:"levelName"`
	Operation   string `json:"operation,omitempty"`
	OperationID string `json:"operationId,omitempty"`
	Path        string `json:"path,omitempty"`
	Section     string `json:"section,omitempty"`
	Line        *int   `json:"line,omitempty"`
	Column      *int   `json:"column,omitempty"`
	EndLine     *int   `json:"endLine,omitempty"`
	EndColumn   *int   `json:"endColumn,omitempty"`
}

type SourceLine struct {
	Kind    string `json:"kind"`
	OldLine *int   `json:"oldLine,omitempty"`
	NewLine *int   `json:"newLine,omitempty"`
	Text    string `json:"text"`
}

type SourceHunk struct {
	Lines []SourceLine `json:"lines"`
}

type SourceDiff struct {
	Hunks []SourceHunk `json:"hunks"`
}

type DiffChange struct {
	ID              string          `json:"id"`
	Category        string          `json:"category"`
	ChangeType      string          `json:"changeType"`
	Subcategory     *string         `json:"subcategory"`
	Path            *string         `json:"path"`
	Method          *string         `json:"method"`
	Component       *string         `json:"component"`
	Field           *string         `json:"field"`
	BasePointer     *string         `json:"-"`
	TargetPointer   *string         `json:"-"`
	DisplayPointer  string          `json:"-"`
	OldValue        json.RawMessage `json:"oldValue,omitempty"`
	NewValue        json.RawMessage `json:"newValue,omitempty"`
	OldValuePresent bool            `json:"oldValuePresent"`
	NewValuePresent bool            `json:"newValuePresent"`
	Source          *SourceDiff     `json:"source,omitempty"`
}

type DiffResponse struct {
	EngineVersion string       `json:"engineVersion"`
	DurationMs    int64        `json:"durationMs"`
	Changes       []DiffChange `json:"changes"`
}

type ValidateResponse struct {
	Valid         bool   `json:"valid"`
	EngineVersion string `json:"engineVersion"`
}

type HealthResponse struct {
	Status        string `json:"status"`
	EngineVersion string `json:"engineVersion"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ErrorResponse struct {
	Error APIError `json:"error"`
}
