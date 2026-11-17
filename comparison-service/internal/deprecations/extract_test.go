package deprecations

import "testing"

func TestExtractOperationAndComponentDeprecations(t *testing.T) {
	diff := map[string]any{
		"paths": map[string]any{
			"modified": map[string]any{
				"/pets": map[string]any{
					"operations": map[string]any{
						"modified": map[string]any{
							"GET": map[string]any{
								"deprecated": map[string]any{"from": false, "to": true},
							},
						},
					},
				},
			},
		},
		"components": map[string]any{
			"schemas": map[string]any{
				"modified": map[string]any{
					"Pet": map[string]any{
						"deprecated": map[string]any{"from": false, "to": true},
					},
				},
			},
		},
	}

	items := Extract(diff)
	if len(items) != 2 {
		t.Fatalf("expected 2 deprecations, got %d: %#v", len(items), items)
	}
	if items[0].Pointer != "/components/schemas/Pet/deprecated" {
		t.Fatalf("unexpected component pointer: %#v", items[0])
	}
	if items[1].Pointer != "/paths/~1pets/get/deprecated" {
		t.Fatalf("unexpected operation pointer: %#v", items[1])
	}
	if items[1].Path != "/pets" || items[1].Method != "GET" {
		t.Fatalf("unexpected operation context: %#v", items[1])
	}
	if !items[1].NewValuePresent || items[1].NewValue != true {
		t.Fatalf("unexpected new value: %#v", items[1])
	}
}

func TestExtractPropertyDeprecation(t *testing.T) {
	diff := map[string]any{
		"components": map[string]any{
			"schemas": map[string]any{
				"modified": map[string]any{
					"Pet": map[string]any{
						"properties": map[string]any{
							"modified": map[string]any{
								"tag": map[string]any{
									"deprecated": map[string]any{"from": false, "to": true},
								},
							},
						},
					},
				},
			},
		},
	}

	items := Extract(diff)
	if len(items) != 1 {
		t.Fatalf("expected 1 deprecation, got %#v", items)
	}
	if items[0].Pointer != "/components/schemas/Pet/properties/tag/deprecated" {
		t.Fatalf("unexpected property pointer: %#v", items[0])
	}
}

func TestExtractSkipsUndeprecation(t *testing.T) {
	diff := map[string]any{
		"paths": map[string]any{
			"modified": map[string]any{
				"/pets": map[string]any{
					"operations": map[string]any{
						"modified": map[string]any{
							"GET": map[string]any{
								"deprecated": map[string]any{"from": true, "to": false},
							},
						},
					},
				},
			},
		},
	}
	if items := Extract(diff); len(items) != 0 {
		t.Fatalf("expected no deprecations, got %#v", items)
	}
}
