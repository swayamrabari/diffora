package diffchange

import (
	"testing"

	"diffora/comparison-service/internal/model"
)

const sourceBase = `openapi: 3.0.3
info:
  title: Pets
  version: "1"
paths: {}
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
          maxLength: 80
        status:
          type: string
        tag:
          type: string
`

const sourceTarget = `openapi: 3.0.3
info:
  title: Pets
  version: "1"
paths: {}
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
          maxLength: 120
        status:
          type: string
        tag:
          type: string
`

func pointer(value string) *string {
	return &value
}

func buildTestSourceDiff(t *testing.T, base, target, basePointer, targetPointer string) *model.SourceDiff {
	t.Helper()
	baseLines := splitSourceLines(base)
	targetLines := splitSourceLines(target)
	return buildSourceDiff(
		baseLines,
		targetLines,
		buildSourceIndex(base, baseLines),
		buildSourceIndex(target, targetLines),
		pointer(basePointer),
		pointer(targetPointer),
	)
}

func TestBuildSourceDiffModifiedScalar(t *testing.T) {
	diff := buildTestSourceDiff(
		t,
		sourceBase,
		sourceTarget,
		"/components/schemas/Pet/properties/name/maxLength",
		"/components/schemas/Pet/properties/name/maxLength",
	)
	if diff == nil || len(diff.Hunks) != 1 {
		t.Fatalf("expected one hunk, got %#v", diff)
	}

	var removed, added, context int
	for _, line := range diff.Hunks[0].Lines {
		switch line.Kind {
		case "removed":
			removed++
			if line.Text != "          maxLength: 80" {
				t.Fatalf("unexpected removed line: %q", line.Text)
			}
			if line.OldLine == nil || *line.OldLine != 13 {
				t.Fatalf("unexpected removed line number: %#v", line.OldLine)
			}
		case "added":
			added++
			if line.Text != "          maxLength: 120" {
				t.Fatalf("unexpected added line: %q", line.Text)
			}
			if line.NewLine == nil || *line.NewLine != 13 {
				t.Fatalf("unexpected added line number: %#v", line.NewLine)
			}
		case "context":
			context++
		}
	}
	if removed != 1 || added != 1 {
		t.Fatalf("expected one removed and one added line, got %d/%d", removed, added)
	}
	if context != 6 {
		t.Fatalf("expected six context lines, got %d", context)
	}
}

func TestBuildSourceDiffAddedBlock(t *testing.T) {
	base := `components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
        tag:
          type: string
`
	target := `components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
        tag:
          type: string
        status:
          type: string
          enum:
            - available
            - pending
            - reserved
`
	diff := buildTestSourceDiff(
		t,
		base,
		target,
		"/components/schemas/Pet/properties/missing",
		"/components/schemas/Pet/properties/status",
	)
	if diff == nil || len(diff.Hunks) != 1 {
		t.Fatalf("expected one hunk, got %#v", diff)
	}

	var added, context int
	for _, line := range diff.Hunks[0].Lines {
		switch line.Kind {
		case "added":
			added++
		case "context":
			context++
		}
	}
	if added != 6 {
		t.Fatalf("expected six added lines, got %d: %#v", added, diff.Hunks[0].Lines)
	}
	if context < 3 {
		t.Fatalf("expected context above the block, got %d", context)
	}
}

func TestBuildSourceDiffRemovedBlock(t *testing.T) {
	base := `components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
        status:
          type: string
          enum:
            - available
            - pending
            - reserved
        tag:
          type: string
`
	target := `components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
        tag:
          type: string
`
	diff := buildTestSourceDiff(
		t,
		base,
		target,
		"/components/schemas/Pet/properties/status",
		"/components/schemas/Pet/properties/missing",
	)
	if diff == nil || len(diff.Hunks) != 1 {
		t.Fatalf("expected one hunk, got %#v", diff)
	}

	var removed, context int
	for _, line := range diff.Hunks[0].Lines {
		switch line.Kind {
		case "removed":
			removed++
		case "context":
			context++
		}
	}
	if removed != 6 {
		t.Fatalf("expected six removed lines, got %d: %#v", removed, diff.Hunks[0].Lines)
	}
	if context < 3 {
		t.Fatalf("expected context around the block, got %d", context)
	}
}

func TestBuildSourceDiffMultiLineScalar(t *testing.T) {
	base := `description: |
  line one
  line two
next: value
`
	target := `description: |
  line one
  line three
next: value
`
	diff := buildTestSourceDiff(t, base, target, "/description", "/description")
	if diff == nil || len(diff.Hunks) != 1 {
		t.Fatalf("expected one hunk, got %#v", diff)
	}

	var removed, added string
	for _, line := range diff.Hunks[0].Lines {
		if line.Kind == "removed" {
			removed = line.Text
		}
		if line.Kind == "added" {
			added = line.Text
		}
	}
	if removed != "  line two" || added != "  line three" {
		t.Fatalf("unexpected block diff: removed=%q added=%q", removed, added)
	}
}

func TestBuildSourceIndexJSON(t *testing.T) {
	content := `{"openapi":"3.0.3","info":{"title":"Pets","version":"1"},"components":{"schemas":{"Pet":{"type":"object","properties":{"name":{"type":"string","maxLength":80}}}}}}`
	index := buildSourceIndex(content, splitSourceLines(content))
	if index == nil {
		t.Fatal("expected a source index")
	}
	value, ok := index.rangeFor(pointer("/components/schemas/Pet/properties/name/maxLength"))
	if !ok {
		t.Fatalf("expected a range for maxLength, got %#v", index.ranges)
	}
	if value.start != 1 || value.end != 1 {
		t.Fatalf("unexpected JSON range: %#v", value)
	}
}

func TestSplitSourceLinesHandlesCRLF(t *testing.T) {
	lines := splitSourceLines("one\r\ntwo\r\n")
	if len(lines) != 2 || lines[0] != "one" || lines[1] != "two" {
		t.Fatalf("unexpected lines: %#v", lines)
	}
}

func TestBuilderAttachesSource(t *testing.T) {
	baseLines := splitSourceLines(sourceBase)
	targetLines := splitSourceLines(sourceTarget)
	b := &builder{
		baseLines:    baseLines,
		targetLines:  targetLines,
		baseSource:   buildSourceIndex(sourceBase, baseLines),
		targetSource: buildSourceIndex(sourceTarget, targetLines),
		seen:         map[string]bool{},
	}

	b.add(model.DiffChange{
		ChangeType:    "modified",
		BasePointer:   pointer("/components/schemas/Pet/properties/name/maxLength"),
		TargetPointer: pointer("/components/schemas/Pet/properties/name/maxLength"),
	})

	if len(b.changes) != 1 {
		t.Fatalf("expected one change, got %d", len(b.changes))
	}
	if b.changes[0].Source == nil || len(b.changes[0].Source.Hunks) == 0 {
		t.Fatalf("expected source hunks, got %#v", b.changes[0].Source)
	}
}
