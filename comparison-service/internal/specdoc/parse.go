package specdoc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// Parse loads a YAML or JSON document for pointer resolution. It does not
// validate OpenAPI; oasdiff owns validation.
func Parse(content, format string) (any, error) {
	content = strings.TrimPrefix(content, "\ufeff")

	var value any
	if strings.EqualFold(format, "json") {
		decoder := json.NewDecoder(bytes.NewReader([]byte(content)))
		decoder.UseNumber()
		if err := decoder.Decode(&value); err != nil {
			return nil, fmt.Errorf("parse JSON: %w", err)
		}
	} else {
		if err := yaml.Unmarshal([]byte(content), &value); err != nil {
			return nil, fmt.Errorf("parse YAML: %w", err)
		}
	}

	return normalize(value), nil
}

func normalize(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			typed[key] = normalize(child)
		}
		return typed
	case map[any]any:
		out := make(map[string]any, len(typed))
		for key, child := range typed {
			out[fmt.Sprint(key)] = normalize(child)
		}
		return out
	case []any:
		for index, child := range typed {
			typed[index] = normalize(child)
		}
		return typed
	default:
		return typed
	}
}
