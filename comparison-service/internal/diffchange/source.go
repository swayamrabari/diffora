package diffchange

import (
	"fmt"
	"strconv"
	"strings"

	"diffora/comparison-service/internal/model"
	"gopkg.in/yaml.v3"
)

const (
	maxDiffCells = 250_000
	maxHunkLines = 600
)

type lineRange struct {
	start int
	end   int
}

type sourceIndex struct {
	ranges map[string]lineRange
	arrays map[string]bool
	lines  []string
}

func buildSourceIndex(content string, lines []string) *sourceIndex {
	content = strings.TrimPrefix(content, "\ufeff")
	if strings.TrimSpace(content) == "" {
		return nil
	}

	var document yaml.Node
	if err := yaml.Unmarshal([]byte(content), &document); err != nil {
		return nil
	}
	if document.Kind != yaml.DocumentNode || len(document.Content) == 0 {
		return nil
	}

	index := &sourceIndex{
		ranges: make(map[string]lineRange),
		arrays: make(map[string]bool),
		lines:  lines,
	}
	index.walk(document.Content[0], "", 0)
	return index
}

func (s *sourceIndex) walk(node *yaml.Node, pointer string, depth int) {
	if node == nil || depth > 200 {
		return
	}

	if node.Kind == yaml.AliasNode && node.Alias != nil {
		s.ranges[pointer] = lineRange{start: node.Line, end: node.Line}
		if node.Alias.Kind == yaml.SequenceNode {
			s.arrays[pointer] = true
		}
		s.walkChildren(node.Alias, pointer, depth+1)
		return
	}

	s.ranges[pointer] = lineRange{start: node.Line, end: nodeEndLine(node, s.lines)}
	if node.Kind == yaml.SequenceNode {
		s.arrays[pointer] = true
	}
	s.walkChildren(node, pointer, depth+1)
}

func (s *sourceIndex) walkChildren(node *yaml.Node, pointer string, depth int) {
	if node == nil || depth > 200 {
		return
	}

	switch node.Kind {
	case yaml.MappingNode:
		for index := 0; index+1 < len(node.Content); index += 2 {
			key := node.Content[index]
			value := node.Content[index+1]
			childPointer := pointer + "/" + escapeSourceSegment(key.Value)
			s.walk(value, childPointer, depth+1)

			// Block mappings and sequences start on the line after their key.
			// Include the key line so the hunk shows `status:` or `enum:` too.
			if childRange, ok := s.ranges[childPointer]; ok && key.Line < childRange.start {
				childRange.start = key.Line
				s.ranges[childPointer] = childRange
			}
		}
	case yaml.SequenceNode:
		for index, child := range node.Content {
			s.walk(child, pointer+"/"+strconv.Itoa(index), depth+1)
		}
	}
}

func (s *sourceIndex) rangeFor(pointer *string) (lineRange, bool) {
	if s == nil || pointer == nil {
		return lineRange{}, false
	}
	if value, ok := s.ranges[*pointer]; ok {
		return value, true
	}

	// oasdiff reports added/deleted array items by diff index, which does not
	// always match the source index. Fall back to the nearest enclosing array
	// so the item still gets a useful source hunk.
	parts := strings.Split(*pointer, "/")
	for len(parts) > 1 {
		if _, err := strconv.Atoi(parts[len(parts)-1]); err != nil {
			break
		}
		parts = parts[:len(parts)-1]
		candidate := strings.Join(parts, "/")
		if !s.arrays[candidate] {
			continue
		}
		if value, ok := s.ranges[candidate]; ok {
			return value, true
		}
	}
	return lineRange{}, false
}

func nodeEndLine(node *yaml.Node, lines []string) int {
	if node == nil {
		return 0
	}

	if node.Kind == yaml.ScalarNode {
		if node.Style == yaml.LiteralStyle || node.Style == yaml.FoldedStyle {
			return blockScalarEndLine(node, lines)
		}
		return node.Line
	}

	end := node.Line
	for _, child := range node.Content {
		if childEnd := nodeEndLine(child, lines); childEnd > end {
			end = childEnd
		}
	}
	if node.Kind == yaml.AliasNode && node.Alias != nil {
		if aliasEnd := nodeEndLine(node.Alias, lines); aliasEnd > end {
			end = aliasEnd
		}
	}
	return end
}

func blockScalarEndLine(node *yaml.Node, lines []string) int {
	if node.Line < 1 || node.Line > len(lines) {
		return node.Line
	}
	indent := leadingIndent(lines[node.Line-1])
	end := node.Line
	for lineNumber := node.Line + 1; lineNumber <= len(lines); lineNumber++ {
		text := lines[lineNumber-1]
		if strings.TrimSpace(text) == "" {
			end = lineNumber
			continue
		}
		if leadingIndent(text) > indent {
			end = lineNumber
			continue
		}
		break
	}
	return end
}

func leadingIndent(value string) int {
	count := 0
	for _, char := range value {
		if char == ' ' {
			count++
			continue
		}
		break
	}
	return count
}

func escapeSourceSegment(value string) string {
	value = strings.ReplaceAll(value, "~", "~0")
	return strings.ReplaceAll(value, "/", "~1")
}

func splitSourceLines(content string) []string {
	content = strings.TrimPrefix(content, "\ufeff")
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	if content == "" {
		return nil
	}

	lines := strings.Split(content, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func buildSourceDiff(
	baseLines []string,
	targetLines []string,
	baseIndex *sourceIndex,
	targetIndex *sourceIndex,
	basePointer *string,
	targetPointer *string,
) *model.SourceDiff {
	baseRange, baseOK := baseIndex.rangeFor(basePointer)
	targetRange, targetOK := targetIndex.rangeFor(targetPointer)

	switch {
	case baseOK && targetOK:
		hunks := buildModifiedHunks(baseLines, targetLines, baseRange, targetRange)
		if len(hunks) == 0 {
			return nil
		}
		return &model.SourceDiff{Hunks: hunks}
	case baseOK:
		hunk := buildOneSidedHunk(baseLines, baseRange, false)
		if len(hunk.Lines) == 0 {
			return nil
		}
		return &model.SourceDiff{Hunks: []model.SourceHunk{hunk}}
	case targetOK:
		hunk := buildOneSidedHunk(targetLines, targetRange, true)
		if len(hunk.Lines) == 0 {
			return nil
		}
		return &model.SourceDiff{Hunks: []model.SourceHunk{hunk}}
	default:
		return nil
	}
}

func buildModifiedHunks(
	baseLines []string,
	targetLines []string,
	baseRange lineRange,
	targetRange lineRange,
) []model.SourceHunk {
	baseFrom := max(0, baseRange.start-1)
	baseTo := min(len(baseLines), baseRange.end)
	targetFrom := max(0, targetRange.start-1)
	targetTo := min(len(targetLines), targetRange.end)

	if baseFrom >= baseTo && targetFrom >= targetTo {
		return nil
	}

	baseBlock := baseLines[baseFrom:baseTo]
	targetBlock := targetLines[targetFrom:targetTo]

	lines, ok := diffSourceLines(baseBlock, targetBlock, baseFrom+1, targetFrom+1)
	if !ok {
		lines = make([]model.SourceLine, 0, len(baseBlock)+len(targetBlock))
		for index, text := range baseBlock {
			lines = append(lines, makeSourceLine("removed", baseFrom+index+1, 0, text))
		}
		for index, text := range targetBlock {
			lines = append(lines, makeSourceLine("added", 0, targetFrom+index+1, text))
		}
	}
	return groupChangedSourceHunks(lines)
}

func buildOneSidedHunk(lines []string, valueRange lineRange, added bool) model.SourceHunk {
	from := max(1, valueRange.start)
	to := min(len(lines), valueRange.end)
	out := make([]model.SourceLine, 0, max(0, to-from+1))

	for lineNumber := from; lineNumber <= to; lineNumber++ {
		if added {
			out = append(out, makeSourceLine("added", 0, lineNumber, lines[lineNumber-1]))
		} else {
			out = append(out, makeSourceLine("removed", lineNumber, 0, lines[lineNumber-1]))
		}
	}

	return model.SourceHunk{Lines: capSourceLines(out)}
}

func diffSourceLines(
	baseLines []string,
	targetLines []string,
	baseStart int,
	targetStart int,
) ([]model.SourceLine, bool) {
	rows := len(baseLines)
	columns := len(targetLines)

	if rows == 0 && columns == 0 {
		return nil, true
	}
	if rows*columns > maxDiffCells {
		return nil, false
	}

	table := make([][]int, rows+1)
	for index := range table {
		table[index] = make([]int, columns+1)
	}
	for row := rows - 1; row >= 0; row-- {
		for column := columns - 1; column >= 0; column-- {
			switch {
			case baseLines[row] == targetLines[column]:
				table[row][column] = table[row+1][column+1] + 1
			case table[row+1][column] >= table[row][column+1]:
				table[row][column] = table[row+1][column]
			default:
				table[row][column] = table[row][column+1]
			}
		}
	}

	out := make([]model.SourceLine, 0, rows+columns)
	row, column := 0, 0
	for row < rows && column < columns {
		switch {
		case baseLines[row] == targetLines[column]:
			out = append(out, makeSourceLine("context", baseStart+row, targetStart+column, baseLines[row]))
			row++
			column++
		case table[row+1][column] >= table[row][column+1]:
			out = append(out, makeSourceLine("removed", baseStart+row, 0, baseLines[row]))
			row++
		default:
			out = append(out, makeSourceLine("added", 0, targetStart+column, targetLines[column]))
			column++
		}
	}
	for row < rows {
		out = append(out, makeSourceLine("removed", baseStart+row, 0, baseLines[row]))
		row++
	}
	for column < columns {
		out = append(out, makeSourceLine("added", 0, targetStart+column, targetLines[column]))
		column++
	}
	return out, true
}

func groupChangedSourceHunks(lines []model.SourceLine) []model.SourceHunk {
	hunks := make([]model.SourceHunk, 0)
	current := make([]model.SourceLine, 0)
	sawContext := false

	for _, line := range lines {
		if line.Kind != "added" && line.Kind != "removed" {
			if len(current) > 0 {
				sawContext = true
			}
			continue
		}
		if sawContext && len(current) > 0 {
			hunks = append(hunks, model.SourceHunk{Lines: capSourceLines(current)})
			current = nil
			sawContext = false
		}
		current = append(current, line)
	}
	if len(current) > 0 {
		hunks = append(hunks, model.SourceHunk{Lines: capSourceLines(current)})
	}
	return hunks
}

func capSourceLines(lines []model.SourceLine) []model.SourceLine {
	if len(lines) <= maxHunkLines {
		return lines
	}

	half := maxHunkLines / 2
	omitted := len(lines) - half*2
	out := make([]model.SourceLine, 0, half*2+1)
	out = append(out, lines[:half]...)
	out = append(out, model.SourceLine{
		Kind: "gap",
		Text: fmt.Sprintf("… %d lines omitted …", omitted),
	})
	out = append(out, lines[len(lines)-half:]...)
	return out
}

func makeSourceLine(kind string, oldLine, newLine int, text string) model.SourceLine {
	line := model.SourceLine{Kind: kind, Text: text}
	if oldLine > 0 {
		value := oldLine
		line.OldLine = &value
	}
	if newLine > 0 {
		value := newLine
		line.NewLine = &value
	}
	return line
}
