package diffchange

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"diffora/comparison-service/internal/model"
)

type context struct {
	category    string
	subcategory string
	path        string
	method      string
	fieldPrefix string
}

type builder struct {
	base    any
	target  any
	changes []model.DiffChange
	seen    map[string]bool
}

// Build flattens the raw oasdiff object into unique, typed changes. It follows
// $ref so operation copies collapse onto their component locations.
func Build(diff map[string]any, base, target any) []model.DiffChange {
	b := &builder{
		base:   base,
		target: target,
		seen:   map[string]bool{},
	}

	if info, ok := asMap(diff["info"]); ok {
		b.walkGenericObject(info, []string{"info"}, []string{"info"}, context{category: "metadata"})
	}
	if paths, ok := asMap(diff["paths"]); ok {
		b.walkPaths(paths, "paths", "endpoint", "")
	}
	if webhooks, ok := asMap(diff["webhooks"]); ok {
		b.walkPaths(webhooks, "webhooks", "webhook", "")
	}
	if components, ok := asMap(diff["components"]); ok {
		b.walkComponents(components)
	}
	if security, ok := asMap(diff["security"]); ok {
		b.walkSecurity(security, []string{"security"}, []string{"security"}, context{category: "security"})
	}
	if servers, ok := asMap(diff["servers"]); ok {
		b.walkServers(servers)
	}
	if tags, ok := asMap(diff["tags"]); ok {
		b.walkStringList("tags", tags, []string{"tags"}, []string{"tags"}, context{category: "metadata"})
	}
	if externalDocs, ok := asMap(diff["externalDocs"]); ok {
		b.walkGenericObject(externalDocs, []string{"externalDocs"}, []string{"externalDocs"}, context{category: "metadata"})
	}

	sort.SliceStable(b.changes, func(i, j int) bool {
		left := b.changes[i]
		right := b.changes[j]
		return categoryRank(left.Category) < categoryRank(right.Category) ||
			(categoryRank(left.Category) == categoryRank(right.Category) &&
				(left.DisplayPointer < right.DisplayPointer ||
					(left.DisplayPointer == right.DisplayPointer &&
						changeRank(left.ChangeType) < changeRank(right.ChangeType))))
	})

	return b.changes
}

func (b *builder) walkPaths(paths map[string]any, root, category, parentPath string) {
	if added, ok := asSlice(paths["added"]); ok {
		for _, item := range added {
			path := str(item)
			if path == "" {
				continue
			}
			b.emitAdded(context{category: category, path: path}, appendSegment([]string{root}, path), appendSegment([]string{root}, path), path, nil)
		}
	}
	if deleted, ok := asSlice(paths["deleted"]); ok {
		for _, item := range deleted {
			path := str(item)
			if path == "" {
				continue
			}
			b.emitRemoved(context{category: category, path: path}, appendSegment([]string{root}, path), appendSegment([]string{root}, path), path, nil)
		}
	}
	modified, ok := asMap(paths["modified"])
	if !ok {
		return
	}

	for path, rawPathDiff := range modified {
		pathDiff, ok := asMap(rawPathDiff)
		if !ok {
			continue
		}
		baseSegs := appendSegment([]string{root}, path)
		targetSegs := appendSegment([]string{root}, path)

		if ops, ok := asMap(pathDiff["operations"]); ok {
			b.walkOperations(ops, baseSegs, targetSegs, path)
		}
		if params, ok := asMap(pathDiff["parameters"]); ok {
			b.walkParameters(params, baseSegs, targetSegs, path, "")
		}
		for key, value := range pathDiff {
			if key == "operations" || key == "parameters" {
				continue
			}
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, mapKey(key)), appendSegment(targetSegs, mapKey(key)), context{category: category, path: path})
			}
		}
	}
}

func (b *builder) walkOperations(ops map[string]any, baseSegs, targetSegs []string, path string) {
	if added, ok := asSlice(ops["added"]); ok {
		for _, item := range added {
			method := strings.ToUpper(str(item))
			segs := appendSegment(targetSegs, strings.ToLower(method))
			b.emitAdded(context{category: "operation", path: path, method: method}, segs, segs, method, nil)
		}
	}
	if deleted, ok := asSlice(ops["deleted"]); ok {
		for _, item := range deleted {
			method := strings.ToUpper(str(item))
			segs := appendSegment(baseSegs, strings.ToLower(method))
			b.emitRemoved(context{category: "operation", path: path, method: method}, segs, segs, method, nil)
		}
	}
	modified, ok := asMap(ops["modified"])
	if !ok {
		return
	}
	for method, rawDiff := range modified {
		opDiff, ok := asMap(rawDiff)
		if !ok {
			continue
		}
		upper := strings.ToUpper(method)
		b.walkOperation(opDiff, appendSegment(baseSegs, strings.ToLower(method)), appendSegment(targetSegs, strings.ToLower(method)), path, upper)
	}
}

func (b *builder) walkOperation(opDiff map[string]any, baseSegs, targetSegs []string, path, method string) {
	c := context{category: "operation", path: path, method: method}
	for key, value := range opDiff {
		switch key {
		case "parameters":
			if params, ok := asMap(value); ok {
				b.walkParameters(params, baseSegs, targetSegs, path, method)
			}
		case "requestBody":
			if node, ok := asMap(value); ok {
				b.walkRequestBody(node, appendSegment(baseSegs, "requestBody"), appendSegment(targetSegs, "requestBody"), path, method)
			}
		case "responses":
			if node, ok := asMap(value); ok {
				b.walkResponses(node, baseSegs, targetSegs, path, method)
			}
		case "securityRequirements":
			if node, ok := asMap(value); ok {
				b.walkSecurity(node, appendSegment(baseSegs, "security"), appendSegment(targetSegs, "security"), context{category: "security", path: path, method: method})
			}
		case "tags":
			if node, ok := asMap(value); ok {
				b.walkStringList("tags", node, appendSegment(baseSegs, "tags"), appendSegment(targetSegs, "tags"), c)
			}
		case "summary", "description", "deprecated":
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, key), appendSegment(targetSegs, key), c)
			}
		case "operationID":
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, "operationId"), appendSegment(targetSegs, "operationId"), c)
			}
		default:
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, mapKey(key)), appendSegment(targetSegs, mapKey(key)), c)
			}
		}
	}
}

func (b *builder) walkParameters(paramDiff map[string]any, baseSegs, targetSegs []string, path, method string) {
	if added, ok := asMap(paramDiff["added"]); ok {
		for location, rawNames := range added {
			names, _ := asSlice(rawNames)
			for _, rawName := range names {
				name := str(rawName)
				segs := b.parameterSegments(b.target, targetSegs, location, name)
				if segs == nil {
					segs = appendSegment(appendSegment(targetSegs, "parameters"), name)
				}
				b.emitAdded(context{category: "parameter", subcategory: location, path: path, method: method}, segs, segs, name, nil)
			}
		}
	}
	if deleted, ok := asMap(paramDiff["deleted"]); ok {
		for location, rawNames := range deleted {
			names, _ := asSlice(rawNames)
			for _, rawName := range names {
				name := str(rawName)
				segs := b.parameterSegments(b.base, baseSegs, location, name)
				if segs == nil {
					segs = appendSegment(appendSegment(baseSegs, "parameters"), name)
				}
				b.emitRemoved(context{category: "parameter", subcategory: location, path: path, method: method}, segs, segs, name, nil)
			}
		}
	}
	modified, ok := asMap(paramDiff["modified"])
	if !ok {
		return
	}
	for location, rawByName := range modified {
		byName, ok := asMap(rawByName)
		if !ok {
			continue
		}
		for name, rawDiff := range byName {
			node, ok := asMap(rawDiff)
			if !ok {
				continue
			}
			baseParam := b.parameterSegments(b.base, baseSegs, location, name)
			targetParam := b.parameterSegments(b.target, targetSegs, location, name)
			if baseParam == nil {
				baseParam = appendSegment(appendSegment(baseSegs, "parameters"), name)
			}
			if targetParam == nil {
				targetParam = appendSegment(appendSegment(targetSegs, "parameters"), name)
			}
			b.walkParameterDiff(node, baseParam, targetParam, path, method, location, name)
		}
	}
}

func (b *builder) walkParameterDiff(diff map[string]any, baseSegs, targetSegs []string, path, method, location, name string) {
	prefix := name
	if location == "component" {
		prefix = strings.ToLower(name)
	}
	c := context{category: "parameter", subcategory: location, path: path, method: method, fieldPrefix: prefix}
	for key, value := range diff {
		switch key {
		case "schema":
			if node, ok := asMap(value); ok {
				b.walkSchemaDiff(node, appendSegment(baseSegs, "schema"), appendSegment(targetSegs, "schema"), c, name)
			}
		case "content":
			if node, ok := asMap(value); ok {
				b.walkContent(node, appendSegment(baseSegs, "content"), appendSegment(targetSegs, "content"), c, name)
			}
		case "examples", "example":
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, key), appendSegment(targetSegs, key), context{category: "metadata", path: path, method: method})
			}
		default:
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, mapKey(key)), appendSegment(targetSegs, mapKey(key)), c)
			}
		}
	}
}

func (b *builder) walkRequestBody(diff map[string]any, baseSegs, targetSegs []string, path, method string) {
	c := context{category: "request", path: path, method: method}
	for key, value := range diff {
		switch key {
		case "content":
			if node, ok := asMap(value); ok {
				b.walkContent(node, appendSegment(baseSegs, "content"), appendSegment(targetSegs, "content"), c, "")
			}
		default:
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, mapKey(key)), appendSegment(targetSegs, mapKey(key)), c)
			}
		}
	}
}

func (b *builder) walkResponses(diff map[string]any, baseSegs, targetSegs []string, path, method string) {
	if added, ok := asSlice(diff["added"]); ok {
		for _, item := range added {
			code := str(item)
			segs := append(appendSegment(targetSegs, "responses"), code)
			b.emitAdded(context{category: "response", subcategory: code, path: path, method: method}, segs, segs, code, nil)
		}
	}
	if deleted, ok := asSlice(diff["deleted"]); ok {
		for _, item := range deleted {
			code := str(item)
			segs := append(appendSegment(baseSegs, "responses"), code)
			b.emitRemoved(context{category: "response", subcategory: code, path: path, method: method}, segs, segs, code, nil)
		}
	}
	modified, ok := asMap(diff["modified"])
	if !ok {
		return
	}
	for code, rawDiff := range modified {
		node, ok := asMap(rawDiff)
		if !ok {
			continue
		}
		b.walkResponse(node, append(appendSegment(baseSegs, "responses"), code), append(appendSegment(targetSegs, "responses"), code), path, method, code)
	}
}

func (b *builder) walkResponse(diff map[string]any, baseSegs, targetSegs []string, path, method, code string) {
	c := context{category: "response", subcategory: code, path: path, method: method}
	for key, value := range diff {
		switch key {
		case "headers":
			if node, ok := asMap(value); ok {
				b.walkHeaders(node, baseSegs, targetSegs, path, method, code)
			}
		case "content":
			if node, ok := asMap(value); ok {
				b.walkContent(node, appendSegment(baseSegs, "content"), appendSegment(targetSegs, "content"), c, "")
			}
		default:
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, mapKey(key)), appendSegment(targetSegs, mapKey(key)), c)
			}
		}
	}
}

func (b *builder) walkHeaders(diff map[string]any, baseSegs, targetSegs []string, path, method, code string) {
	headerSegs := func(doc any, segs []string, name string) []string {
		headers, _ := asMap(resolveMap(doc, appendSegment(segs, "headers")))
		for key := range headers {
			if strings.EqualFold(key, name) {
				return append(appendSegment(segs, "headers"), key)
			}
		}
		return append(appendSegment(segs, "headers"), name)
	}

	if added, ok := asSlice(diff["added"]); ok {
		for _, item := range added {
			name := str(item)
			segs := headerSegs(b.target, targetSegs, name)
			b.emitAdded(context{category: "header", subcategory: name, path: path, method: method}, segs, segs, name, nil)
		}
	}
	if deleted, ok := asSlice(diff["deleted"]); ok {
		for _, item := range deleted {
			name := str(item)
			segs := headerSegs(b.base, baseSegs, name)
			b.emitRemoved(context{category: "header", subcategory: name, path: path, method: method}, segs, segs, name, nil)
		}
	}
	modified, ok := asMap(diff["modified"])
	if !ok {
		return
	}
	for name, rawDiff := range modified {
		node, ok := asMap(rawDiff)
		if !ok {
			continue
		}
		baseHeader := headerSegs(b.base, baseSegs, name)
		targetHeader := headerSegs(b.target, targetSegs, name)
		b.walkSchemaDiff(node, appendSegment(baseHeader, "schema"), appendSegment(targetHeader, "schema"), context{category: "header", subcategory: name, path: path, method: method}, name)
	}
}

func (b *builder) walkContent(diff map[string]any, baseSegs, targetSegs []string, c context, field string) {
	if added, ok := asSlice(diff["added"]); ok {
		for _, item := range added {
			media := str(item)
			segs := append(targetSegs, media)
			b.emitAdded(context{category: c.category, subcategory: media, path: c.path, method: c.method}, segs, segs, field, nil)
		}
	}
	if deleted, ok := asSlice(diff["deleted"]); ok {
		for _, item := range deleted {
			media := str(item)
			segs := append(baseSegs, media)
			b.emitRemoved(context{category: c.category, subcategory: media, path: c.path, method: c.method}, segs, segs, field, nil)
		}
	}
	modified, ok := asMap(diff["modified"])
	if !ok {
		return
	}
	for media, rawDiff := range modified {
		node, ok := asMap(rawDiff)
		if !ok {
			continue
		}
		baseMedia := append(baseSegs, media)
		targetMedia := append(targetSegs, media)
		for key, value := range node {
			if child, ok := asMap(value); ok {
				if key == "schema" {
					b.walkSchemaDiff(child, appendSegment(baseMedia, "schema"), appendSegment(targetMedia, "schema"), c, field)
				} else {
					b.walkGenericObject(child, appendSegment(baseMedia, mapKey(key)), appendSegment(targetMedia, mapKey(key)), c)
				}
			}
		}
	}
}

func (b *builder) walkSchemaDiff(diff map[string]any, baseSegs, targetSegs []string, c context, field string) {
	if c.subcategory == "" {
		c.subcategory = componentOf(targetSegs)
	}
	for key, raw := range diff {
		value, ok := asMap(raw)
		if !ok {
			continue
		}
		switch key {
		case "properties":
			b.walkProperties(value, baseSegs, targetSegs, c)
		case "required", "enum", "tags":
			b.walkStringList(key, value, appendSegment(baseSegs, key), appendSegment(targetSegs, key), c)
		case "type":
			added, hasAdded := asSlice(value["added"])
			deleted, hasDeleted := asSlice(value["deleted"])
			if hasAdded && hasDeleted && len(added) == 1 && len(deleted) == 1 {
				b.emitModified(c, appendSegment(baseSegs, "type"), appendSegment(targetSegs, "type"), "type", deleted[0], added[0])
			} else if hasAdded {
				for index, item := range added {
					b.emitAdded(c, appendSegment(appendSegment(targetSegs, "type"), strconv.Itoa(index)), appendSegment(appendSegment(targetSegs, "type"), strconv.Itoa(index)), "type", item)
				}
			} else if hasDeleted {
				for index, item := range deleted {
					b.emitRemoved(c, appendSegment(appendSegment(baseSegs, "type"), strconv.Itoa(index)), appendSegment(appendSegment(baseSegs, "type"), strconv.Itoa(index)), "type", item)
				}
			}
		case "items":
			b.walkSchemaDiff(value, appendSegment(baseSegs, "items"), appendSegment(targetSegs, "items"), c, field)
		case "allOf", "oneOf", "anyOf":
			b.walkBranchDiffs(key, value, baseSegs, targetSegs, c, field)
		case "extensions":
			b.walkExtensions(value, baseSegs, targetSegs, c)
		case "modified":
			b.walkSchemaModified(value, baseSegs, targetSegs, c, field)
		case "added", "deleted":
			b.walkUnknownList(key, value, baseSegs, targetSegs, c, field)
		case "from", "to":
			// handled by the caller through walkGenericObject; ignore here
		default:
			mapped := mapKey(key)
			b.walkGenericObject(value, appendSegment(baseSegs, mapped), appendSegment(targetSegs, mapped), c)
		}
	}
}

func (b *builder) walkSchemaModified(diff any, baseSegs, targetSegs []string, c context, field string) {
	modified, ok := asMap(diff)
	if !ok {
		return
	}
	for key, value := range modified {
		node, ok := asMap(value)
		if !ok {
			continue
		}
		b.walkSchemaDiff(node, appendSegment(baseSegs, mapKey(key)), appendSegment(targetSegs, mapKey(key)), c, field)
	}
}

func (b *builder) walkProperties(diff map[string]any, baseSegs, targetSegs []string, c context) {
	if added, ok := asSlice(diff["added"]); ok {
		for _, item := range added {
			name := str(item)
			segs := append(appendSegment(targetSegs, "properties"), name)
			b.emitAdded(c, segs, segs, name, nil)
		}
	}
	if deleted, ok := asSlice(diff["deleted"]); ok {
		for _, item := range deleted {
			name := str(item)
			segs := append(appendSegment(baseSegs, "properties"), name)
			b.emitRemoved(c, segs, segs, name, nil)
		}
	}
	modified, ok := asMap(diff["modified"])
	if !ok {
		return
	}
	for name, raw := range modified {
		node, ok := asMap(raw)
		if !ok {
			continue
		}
		b.walkSchemaDiff(node, append(appendSegment(baseSegs, "properties"), name), append(appendSegment(targetSegs, "properties"), name), c, name)
	}
}

func (b *builder) walkBranchDiffs(key string, diff map[string]any, baseSegs, targetSegs []string, c context, field string) {
	modified, ok := asSlice(diff["modified"])
	if !ok {
		return
	}
	for index, item := range modified {
		branch, ok := asMap(item)
		if !ok {
			continue
		}
		child, ok := asMap(branch["diff"])
		if !ok {
			continue
		}
		b.walkSchemaDiff(child, append(appendSegment(baseSegs, key), strconv.Itoa(index)), append(appendSegment(targetSegs, key), strconv.Itoa(index)), c, field)
	}
}

func (b *builder) walkExtensions(diff map[string]any, baseSegs, targetSegs []string, c context) {
	modified, ok := asMap(diff["modified"])
	if !ok {
		return
	}
	for key, raw := range modified {
		ops, ok := asSlice(raw)
		if !ok {
			continue
		}
		for _, item := range ops {
			op, ok := asMap(item)
			if !ok {
				continue
			}
			b.emitModified(c, appendSegment(baseSegs, key), appendSegment(targetSegs, key), key, op["oldValue"], op["value"])
		}
	}
}

func (b *builder) walkStringList(field string, diff map[string]any, baseSegs, targetSegs []string, c context) {
	if added, ok := asSlice(diff["added"]); ok {
		for index, item := range added {
			segs := append(appendSegment(targetSegs, field), strconv.Itoa(index))
			b.emitAdded(c, segs, segs, field, item)
		}
	}
	if deleted, ok := asSlice(diff["deleted"]); ok {
		for index, item := range deleted {
			segs := append(appendSegment(baseSegs, field), strconv.Itoa(index))
			b.emitRemoved(c, segs, segs, field, item)
		}
	}
}

func (b *builder) walkUnknownList(field string, values any, baseSegs, targetSegs []string, c context, itemField string) {
	items, ok := asSlice(values)
	if !ok {
		return
	}
	for index, item := range items {
		segs := append(appendSegment(targetSegs, field), strconv.Itoa(index))
		b.emitAdded(c, segs, segs, itemField, item)
	}
}

func (b *builder) walkSecurity(diff map[string]any, baseSegs, targetSegs []string, c context) {
	if added, ok := asSlice(diff["added"]); ok {
		for _, item := range added {
			entry, ok := asMap(item)
			if !ok {
				continue
			}
			index := str(entry["index"])
			segs := append(targetSegs, index)
			b.emitAdded(c, segs, segs, "security", entry["schemes"])
		}
	}
	if deleted, ok := asSlice(diff["deleted"]); ok {
		for _, item := range deleted {
			entry, ok := asMap(item)
			if !ok {
				continue
			}
			index := str(entry["index"])
			segs := append(baseSegs, index)
			b.emitRemoved(c, segs, segs, "security", entry["schemes"])
		}
	}
}

func (b *builder) walkServers(diff map[string]any) {
	if added, ok := asSlice(diff["added"]); ok {
		for _, item := range added {
			url := str(item)
			segs := []string{"servers"}
			if list, ok := resolveSlice(b.target, segs); ok {
				for index, server := range list {
					if serverMap, ok := asMap(server); ok && str(serverMap["url"]) == url {
						segs = append(segs, strconv.Itoa(index))
						break
					}
				}
			}
			b.emitAdded(context{category: "server"}, segs, segs, "server", item)
		}
	}
	if deleted, ok := asSlice(diff["deleted"]); ok {
		for _, item := range deleted {
			url := str(item)
			segs := []string{"servers"}
			if list, ok := resolveSlice(b.base, segs); ok {
				for index, server := range list {
					if serverMap, ok := asMap(server); ok && str(serverMap["url"]) == url {
						segs = append(segs, strconv.Itoa(index))
						break
					}
				}
			}
			b.emitRemoved(context{category: "server"}, segs, segs, "server", item)
		}
	}
}

func (b *builder) walkComponents(components map[string]any) {
	categoryFor := map[string]string{
		"schemas":         "schema",
		"parameters":      "parameter",
		"responses":       "response",
		"headers":         "header",
		"requestBodies":   "request",
		"securitySchemes": "security",
		"examples":        "metadata",
		"links":           "response",
		"callbacks":       "operation",
		"pathItems":       "endpoint",
	}
	for kind, rawSection := range components {
		section, ok := asMap(rawSection)
		if !ok {
			continue
		}
		category := categoryFor[kind]
		if category == "" {
			category = "other"
		}
		if added, ok := asSlice(section["added"]); ok {
			for _, item := range added {
				name := str(item)
				segs := []string{"components", kind, name}
				b.emitAdded(context{category: category, subcategory: kind}, segs, segs, name, nil)
			}
		}
		if deleted, ok := asSlice(section["deleted"]); ok {
			for _, item := range deleted {
				name := str(item)
				segs := []string{"components", kind, name}
				b.emitRemoved(context{category: category, subcategory: kind}, segs, segs, name, nil)
			}
		}
		modified, ok := asMap(section["modified"])
		if !ok {
			continue
		}
		for name, rawDiff := range modified {
			node, ok := asMap(rawDiff)
			if !ok {
				continue
			}
			baseSegs := []string{"components", kind, name}
			targetSegs := []string{"components", kind, name}
			switch kind {
			case "schemas":
				b.walkSchemaDiff(node, baseSegs, targetSegs, context{category: "schema", subcategory: name}, name)
			case "parameters":
				b.walkParameterDiff(node, baseSegs, targetSegs, "", "", "component", name)
			case "headers":
				b.walkSchemaDiff(node, appendSegment(baseSegs, "schema"), appendSegment(targetSegs, "schema"), context{category: "header", subcategory: name}, name)
			case "requestBodies":
				b.walkRequestBody(node, baseSegs, targetSegs, "", "")
			case "responses":
				b.walkResponse(node, baseSegs, targetSegs, "", "", name)
			default:
				b.walkGenericObject(node, baseSegs, targetSegs, context{category: category, subcategory: kind})
			}
		}
	}
}

func (b *builder) walkGenericObject(diff map[string]any, baseSegs, targetSegs []string, c context) {
	if _, hasFrom := diff["from"]; hasFrom {
		b.emitModified(c, baseSegs, targetSegs, last(baseSegs), diff["from"], diff["to"])
		return
	}
	if _, hasTo := diff["to"]; hasTo {
		b.emitModified(c, baseSegs, targetSegs, last(baseSegs), nil, diff["to"])
		return
	}
	if modified, ok := asMap(diff["modified"]); ok {
		for key, value := range modified {
			if node, ok := asMap(value); ok {
				b.walkGenericObject(node, appendSegment(baseSegs, mapKey(key)), appendSegment(targetSegs, mapKey(key)), c)
			}
		}
	}
	if added, ok := asSlice(diff["added"]); ok {
		for index, item := range added {
			segs := append(appendSegment(targetSegs, last(baseSegs)), strconv.Itoa(index))
			b.emitAdded(c, segs, segs, last(baseSegs), item)
		}
	}
	if deleted, ok := asSlice(diff["deleted"]); ok {
		for index, item := range deleted {
			segs := append(appendSegment(baseSegs, last(baseSegs)), strconv.Itoa(index))
			b.emitRemoved(c, segs, segs, last(baseSegs), item)
		}
	}
	for key, value := range diff {
		if key == "from" || key == "to" || key == "added" || key == "deleted" || key == "modified" || key == "extensions" {
			continue
		}
		if node, ok := asMap(value); ok {
			b.walkGenericObject(node, appendSegment(baseSegs, mapKey(key)), appendSegment(targetSegs, mapKey(key)), c)
		}
	}
}

func (b *builder) emitModified(c context, baseSegs, targetSegs []string, field string, from, to any) {
	basePointer, baseOK := canonicalPointer(b.base, baseSegs)
	targetPointer, targetOK := canonicalPointer(b.target, targetSegs)
	category := categoryForPointer(targetPointer, c.category)
	if !targetOK {
		category = categoryForPointer(basePointer, c.category)
	}
	component := componentOf(targetPointer)
	if component == "" {
		component = componentOf(basePointer)
	}
	path, method := c.path, c.method
	if component != "" && category != "endpoint" && category != "operation" {
		path, method = "", ""
	}
	fieldLabel := field
	if c.fieldPrefix != "" && field != "" {
		fieldLabel = c.fieldPrefix + "." + field
	}
	change := model.DiffChange{
		Category:        category,
		ChangeType:      "modified",
		Subcategory:     optional(c.subcategory),
		Path:            optional(path),
		Method:          optional(method),
		Component:       optional(component),
		Field:           optional(fieldLabel),
		BasePointer:     optionalPointer(basePointer, baseOK),
		TargetPointer:   optionalPointer(targetPointer, targetOK),
		DisplayPointer:  displayPointer(targetPointer, targetOK, basePointer, baseOK, targetSegs),
		OldValue:        rawValue(from),
		NewValue:        rawValue(to),
		OldValuePresent: from != nil,
		NewValuePresent: to != nil,
	}
	b.add(change)
}

func (b *builder) emitAdded(c context, baseSegs, targetSegs []string, field string, fallback any) {
	targetPointer, targetOK := canonicalPointer(b.target, targetSegs)
	value := fallback
	if targetOK {
		if resolved, _, ok := resolve(b.target, targetSegs, 0); ok {
			value = resolved
		}
	}
	category := categoryForPointer(targetPointer, c.category)
	component := componentOf(targetPointer)
	path, method := c.path, c.method
	if component != "" && category != "endpoint" && category != "operation" {
		path, method = "", ""
	}
	fieldLabel := field
	if c.fieldPrefix != "" && field != "" {
		fieldLabel = c.fieldPrefix + "." + field
	}
	change := model.DiffChange{
		Category:        category,
		ChangeType:      "added",
		Subcategory:     optional(c.subcategory),
		Path:            optional(path),
		Method:          optional(method),
		Component:       optional(component),
		Field:           optional(fieldLabel),
		BasePointer:     nil,
		TargetPointer:   optionalPointer(targetPointer, targetOK),
		DisplayPointer:  displayPointer(targetPointer, targetOK, nil, false, targetSegs),
		NewValue:        rawValue(value),
		NewValuePresent: true,
	}
	b.add(change)
}

func (b *builder) emitRemoved(c context, baseSegs, targetSegs []string, field string, fallback any) {
	basePointer, baseOK := canonicalPointer(b.base, baseSegs)
	value := fallback
	if baseOK {
		if resolved, _, ok := resolve(b.base, baseSegs, 0); ok {
			value = resolved
		}
	}
	category := categoryForPointer(basePointer, c.category)
	component := componentOf(basePointer)
	path, method := c.path, c.method
	if component != "" && category != "endpoint" && category != "operation" {
		path, method = "", ""
	}
	fieldLabel := field
	if c.fieldPrefix != "" && field != "" {
		fieldLabel = c.fieldPrefix + "." + field
	}
	change := model.DiffChange{
		Category:        category,
		ChangeType:      "removed",
		Subcategory:     optional(c.subcategory),
		Path:            optional(path),
		Method:          optional(method),
		Component:       optional(component),
		Field:           optional(fieldLabel),
		BasePointer:     optionalPointer(basePointer, baseOK),
		TargetPointer:   nil,
		DisplayPointer:  displayPointer(nil, false, basePointer, baseOK, baseSegs),
		OldValue:        rawValue(value),
		OldValuePresent: true,
	}
	b.add(change)
}

func (b *builder) add(change model.DiffChange) {
	base := deref(change.BasePointer)
	target := deref(change.TargetPointer)
	key := change.ChangeType + "|" + base + "|" + target
	if key == "modified||" {
		key += "|" + change.DisplayPointer + "|" + string(change.OldValue) + "|" + string(change.NewValue)
	}
	if b.seen[key] {
		return
	}
	b.seen[key] = true
	b.changes = append(b.changes, change)
}

func (b *builder) parameterSegments(doc any, opSegs []string, location, name string) []string {
	if segs := searchParameters(doc, opSegs, location, name, 0); segs != nil {
		return segs
	}
	if len(opSegs) >= 2 {
		if segs := searchParameters(doc, opSegs[:len(opSegs)-1], location, name, 0); segs != nil {
			return segs
		}
	}
	return nil
}

func searchParameters(doc any, ownerSegs []string, location, name string, depth int) []string {
	if depth > 8 {
		return nil
	}
	owner, _, ok := resolve(doc, ownerSegs, 0)
	if !ok {
		return nil
	}
	ownerMap, ok := asMap(owner)
	if !ok {
		return nil
	}
	params, ok := asSlice(ownerMap["parameters"])
	if !ok {
		return nil
	}
	for index := range params {
		candidateSegs := append(appendSegment(ownerSegs, "parameters"), strconv.Itoa(index))
		candidate, canonical, ok := resolve(doc, candidateSegs, 0)
		if !ok {
			continue
		}
		candidate, canonical, ok = derefValue(doc, candidate, canonical, 0)
		if !ok {
			continue
		}
		paramMap, ok := asMap(candidate)
		if !ok {
			continue
		}
		if str(paramMap["in"]) == location && str(paramMap["name"]) == name {
			if len(canonical) >= 3 && canonical[0] == "components" {
				return canonical
			}
			return candidateSegs
		}
	}
	return nil
}

func resolve(root any, segments []string, depth int) (any, []string, bool) {
	if depth > 12 {
		return nil, nil, false
	}
	current := root
	pointer := make([]string, 0, len(segments))

	for index, segment := range segments {
		for refDepth := 0; refDepth < 8; refDepth++ {
			currentMap, ok := asMap(current)
			if !ok {
				break
			}
			ref, ok := currentMap["$ref"].(string)
			if !ok || !strings.HasPrefix(ref, "#/") {
				break
			}
			refSegs := splitPointer(strings.TrimPrefix(ref, "#/"))
			resolved, resolvedPointer, ok := resolve(root, refSegs, depth+1)
			if !ok {
				break
			}
			current = resolved
			pointer = resolvedPointer
		}

		switch typed := current.(type) {
		case map[string]any:
			value, ok := lookup(typed, segment)
			if !ok {
				return nil, nil, false
			}
			current = value
			pointer = append(pointer, segment)
		case []any:
			position, err := strconv.Atoi(segment)
			if err != nil || position < 0 || position >= len(typed) {
				return nil, nil, false
			}
			current = typed[position]
			pointer = append(pointer, segment)
		default:
			return nil, nil, false
		}
		_ = index
	}
	return current, pointer, true
}

func derefValue(doc, value any, pointer []string, depth int) (any, []string, bool) {
	if depth > 8 {
		return value, pointer, false
	}
	for {
		valueMap, ok := asMap(value)
		if !ok {
			return value, pointer, true
		}
		ref, ok := valueMap["$ref"].(string)
		if !ok || !strings.HasPrefix(ref, "#/") {
			return value, pointer, true
		}
		refSegs := splitPointer(strings.TrimPrefix(ref, "#/"))
		resolved, resolvedPointer, ok := resolve(doc, refSegs, depth+1)
		if !ok {
			return value, pointer, true
		}
		value = resolved
		pointer = resolvedPointer
		depth++
		if depth > 8 {
			return value, pointer, false
		}
	}
}

func canonicalPointer(doc any, segments []string) ([]string, bool) {
	_, pointer, ok := resolve(doc, segments, 0)
	return pointer, ok
}

func resolveMap(doc any, segments []string) any {
	value, _, ok := resolve(doc, segments, 0)
	if !ok {
		return nil
	}
	return value
}

func resolveSlice(doc any, segments []string) ([]any, bool) {
	value, _, ok := resolve(doc, segments, 0)
	if !ok {
		return nil, false
	}
	slice, ok := asSlice(value)
	return slice, ok
}

func asMap(value any) (map[string]any, bool) {
	typed, ok := value.(map[string]any)
	return typed, ok
}

func asSlice(value any) ([]any, bool) {
	typed, ok := value.([]any)
	return typed, ok
}

func str(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	default:
		return ""
	}
}

func rawValue(value any) json.RawMessage {
	if value == nil {
		return nil
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	return encoded
}

func lookup(value map[string]any, key string) (any, bool) {
	if found, ok := value[key]; ok {
		return found, true
	}
	for candidate, found := range value {
		if strings.EqualFold(candidate, key) {
			return found, true
		}
	}
	return nil, false
}

func appendSegment(segments []string, segment string) []string {
	next := make([]string, len(segments)+1)
	copy(next, segments)
	next[len(segments)] = segment
	return next
}

func last(segments []string) string {
	if len(segments) == 0 {
		return ""
	}
	return segments[len(segments)-1]
}

func mapKey(key string) string {
	switch key {
	case "max":
		return "maximum"
	case "min":
		return "minimum"
	case "exclusiveMax":
		return "exclusiveMaximum"
	case "exclusiveMin":
		return "exclusiveMinimum"
	case "operationID":
		return "operationId"
	default:
		return key
	}
}

func componentOf(pointer []string) string {
	if len(pointer) >= 3 && pointer[0] == "components" {
		return pointer[2]
	}
	return ""
}

func categoryForPointer(pointer []string, fallback string) string {
	if len(pointer) >= 2 && pointer[0] == "components" {
		switch pointer[1] {
		case "schemas":
			return "schema"
		case "parameters":
			return "parameter"
		case "headers":
			return "header"
		case "requestBodies":
			return "request"
		case "responses":
			return "response"
		case "securitySchemes":
			return "security"
		case "examples", "links":
			return "metadata"
		case "callbacks":
			return "operation"
		case "pathItems":
			return "endpoint"
		}
	}

	for _, segment := range pointer {
		switch segment {
		case "headers":
			return "header"
		case "parameters":
			return "parameter"
		case "requestBody":
			return "request"
		case "responses":
			return "response"
		}
	}

	return fallback
}

func optional(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func optionalPointer(pointer []string, ok bool) *string {
	if !ok || len(pointer) == 0 {
		return nil
	}
	joined := "/" + strings.Join(escapeSegments(pointer), "/")
	return &joined
}

func displayPointer(target []string, targetOK bool, base []string, baseOK bool, fallback []string) string {
	if targetOK && len(target) > 0 {
		return "/" + strings.Join(escapeSegments(target), "/")
	}
	if baseOK && len(base) > 0 {
		return "/" + strings.Join(escapeSegments(base), "/")
	}
	if len(fallback) > 0 {
		return "/" + strings.Join(escapeSegments(fallback), "/")
	}
	return ""
}

func escapeSegments(segments []string) []string {
	out := make([]string, len(segments))
	for index, segment := range segments {
		segment = strings.ReplaceAll(segment, "~", "~0")
		segment = strings.ReplaceAll(segment, "/", "~1")
		out[index] = segment
	}
	return out
}

func splitPointer(value string) []string {
	if value == "" {
		return nil
	}
	parts := strings.Split(value, "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.ReplaceAll(part, "~1", "/")
		part = strings.ReplaceAll(part, "~0", "~")
		out = append(out, part)
	}
	return out
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func categoryRank(category string) int {
	order := []string{"endpoint", "operation", "parameter", "request", "response", "header", "schema", "security", "server", "metadata", "webhook", "other"}
	for index, item := range order {
		if item == category {
			return index
		}
	}
	return len(order)
}

func changeRank(changeType string) int {
	switch changeType {
	case "added":
		return 0
	case "removed":
		return 1
	case "modified":
		return 2
	default:
		return 3
	}
}
