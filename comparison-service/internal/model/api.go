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

type Deprecation struct {
	Pointer         string `json:"pointer"`
	Path            string `json:"path,omitempty"`
	Method          string `json:"method,omitempty"`
	OldValue        any    `json:"oldValue,omitempty"`
	NewValue        any    `json:"newValue,omitempty"`
	OldValuePresent bool   `json:"oldValuePresent"`
	NewValuePresent bool   `json:"newValuePresent"`
}

type DiffResponse struct {
	EngineVersion string          `json:"engineVersion"`
	DurationMs    int64           `json:"durationMs"`
	RawDiffText   string          `json:"rawDiffText"`
	Changelog     []Finding       `json:"changelog"`
	Summary       json.RawMessage `json:"summary"`
	Breaking      []Finding       `json:"breaking"`
	Deprecations  []Deprecation   `json:"deprecations"`
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
