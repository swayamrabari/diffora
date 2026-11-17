package deprecations

import (
	"fmt"
	"sort"
	"strings"

	"diffora/comparison-service/internal/model"
)

// Extract finds deprecated flags that changed to true in the raw diff.
func Extract(diff map[string]any) []model.Deprecation {
	var out []model.Deprecation
	walk(diff, nil, &out)

	seen := map[string]bool{}
	unique := make([]model.Deprecation, 0, len(out))
	for _, item := range out {
		if seen[item.Pointer] {
			continue
		}
		seen[item.Pointer] = true
		unique = append(unique, item)
	}
	sort.Slice(unique, func(i, j int) bool {
		return unique[i].Pointer < unique[j].Pointer
	})
	return unique
}

func walk(node any, segments []string, out *[]model.Deprecation) {
	switch typed := node.(type) {
	case map[string]any:
		if value, ok := typed["deprecated"]; ok {
			if item, ok := parse(value, segments); ok {
				*out = append(*out, item)
			}
		}
		for key, child := range typed {
			walk(child, appendSegment(segments, key), out)
		}
	case []any:
		for index, child := range typed {
			walk(child, appendSegment(segments, fmt.Sprint(index)), out)
		}
	}
}

func parse(value any, segments []string) (model.Deprecation, bool) {
	oldPresent := false
	newPresent := false
	var oldValue any
	var newValue any

	switch typed := value.(type) {
	case map[string]any:
		if from, ok := typed["from"]; ok {
			oldPresent = true
			oldValue = from
		}
		if to, ok := typed["to"]; ok {
			newPresent = true
			newValue = to
		}
		if added, ok := typed["added"].([]any); ok && containsTrue(added) {
			newPresent = true
			newValue = true
		}
		if deleted, ok := typed["deleted"].([]any); ok && containsTrue(deleted) {
			oldPresent = true
			oldValue = true
		}
		if !newPresent || !isTrue(newValue) {
			return model.Deprecation{}, false
		}
	case bool:
		if !typed {
			return model.Deprecation{}, false
		}
		newPresent = true
		newValue = true
	case string:
		if !strings.EqualFold(typed, "true") {
			return model.Deprecation{}, false
		}
		newPresent = true
		newValue = true
	default:
		return model.Deprecation{}, false
	}

	ptr, path, method := documentPointer(segments)
	return model.Deprecation{
		Pointer:         ptr,
		Path:            path,
		Method:          method,
		OldValue:        oldValue,
		NewValue:        newValue,
		OldValuePresent: oldPresent,
		NewValuePresent: newPresent,
	}, true
}

func documentPointer(segments []string) (string, string, string) {
	if index := indexOf(segments, "paths"); index >= 0 {
		pathIndex := nextNonStructuralIndex(segments, index+1)
		if pathIndex >= 0 {
			path := segments[pathIndex]
			methodIndex := indexOfFrom(segments, "operations", pathIndex+1)
			if methodIndex >= 0 {
				methodIndex = nextNonStructuralIndex(segments, methodIndex+1)
				if methodIndex >= 0 {
					method := strings.ToUpper(segments[methodIndex])
					tail := nonStructuralAfter(segments, methodIndex+1)
					parts := []string{"paths", path, strings.ToLower(method)}
					parts = append(parts, tail...)
					parts = append(parts, "deprecated")
					return joinPointer(parts), path, method
				}
			}
			return joinPointer([]string{"paths", path, "deprecated"}), path, ""
		}
	}

	if index := indexOf(segments, "components"); index >= 0 {
		typeIndex := nextNonStructuralIndex(segments, index+1)
		if typeIndex >= 0 {
			nameIndex := nextNonStructuralIndex(segments, typeIndex+1)
			if nameIndex >= 0 {
				tail := nonStructuralAfter(segments, nameIndex+1)
				parts := []string{"components", segments[typeIndex], segments[nameIndex]}
				parts = append(parts, tail...)
				parts = append(parts, "deprecated")
				return joinPointer(parts), "", ""
			}
		}
	}

	return joinPointer(append(segments, "deprecated")), "", ""
}

func joinPointer(segments []string) string {
	var builder strings.Builder
	for _, segment := range segments {
		builder.WriteByte('/')
		segment = strings.ReplaceAll(segment, "~", "~0")
		segment = strings.ReplaceAll(segment, "/", "~1")
		builder.WriteString(segment)
	}
	return builder.String()
}

func containsTrue(values []any) bool {
	for _, value := range values {
		if isTrue(value) {
			return true
		}
	}
	return false
}

func isTrue(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return strings.EqualFold(typed, "true")
	default:
		return false
	}
}

func appendSegment(segments []string, segment string) []string {
	next := make([]string, len(segments)+1)
	copy(next, segments)
	next[len(segments)] = segment
	return next
}

func indexOf(segments []string, target string) int {
	return indexOfFrom(segments, target, 0)
}

func indexOfFrom(segments []string, target string, start int) int {
	for index := start; index < len(segments); index++ {
		if segments[index] == target {
			return index
		}
	}
	return -1
}

func nextNonStructuralIndex(segments []string, start int) int {
	for index := start; index < len(segments); index++ {
		if !isStructural(segments[index]) {
			return index
		}
	}
	return -1
}

func nonStructuralAfter(segments []string, start int) []string {
	out := make([]string, 0, len(segments)-start)
	for index := start; index < len(segments); index++ {
		if !isStructural(segments[index]) && segments[index] != "deprecated" {
			out = append(out, segments[index])
		}
	}
	return out
}

func isStructural(segment string) bool {
	switch segment {
	case "modified", "added", "deleted", "operations", "extensions":
		return true
	default:
		return false
	}
}
