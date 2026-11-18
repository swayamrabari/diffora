package diffchange

import "testing"

func TestBuildDedupesComponentCopies(t *testing.T) {
	base := map[string]any{
		"paths": map[string]any{
			"/pets": map[string]any{
				"get": map[string]any{
					"responses": map[string]any{
						"200": map[string]any{
							"content": map[string]any{
								"application/json": map[string]any{
									"schema": map[string]any{"$ref": "#/components/schemas/Pets"},
								},
							},
						},
					},
				},
			},
		},
		"components": map[string]any{
			"schemas": map[string]any{
				"Pets": map[string]any{
					"type":  "array",
					"items": map[string]any{"$ref": "#/components/schemas/Pet"},
				},
				"Pet": map[string]any{
					"type":       "object",
					"properties": map[string]any{"id": map[string]any{"type": "string"}},
				},
			},
		},
	}

	target := map[string]any{
		"paths": map[string]any{
			"/pets": map[string]any{
				"get": map[string]any{
					"responses": map[string]any{
						"200": map[string]any{
							"content": map[string]any{
								"application/json": map[string]any{
									"schema": map[string]any{"$ref": "#/components/schemas/Pets"},
								},
							},
						},
					},
				},
			},
		},
		"components": map[string]any{
			"schemas": map[string]any{
				"Pets": map[string]any{
					"type":  "array",
					"items": map[string]any{"$ref": "#/components/schemas/Pet"},
				},
				"Pet": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":  map[string]any{"type": "string"},
						"tag": map[string]any{"type": "string"},
					},
				},
			},
		},
	}

	diff := map[string]any{
		"paths": map[string]any{
			"modified": map[string]any{
				"/pets": map[string]any{
					"operations": map[string]any{
						"modified": map[string]any{
							"GET": map[string]any{
								"responses": map[string]any{
									"modified": map[string]any{
										"200": map[string]any{
											"content": map[string]any{
												"modified": map[string]any{
													"application/json": map[string]any{
														"schema": map[string]any{
															"items": map[string]any{
																"properties": map[string]any{
																	"added": []any{"tag"},
																},
															},
														},
													},
												},
											},
										},
									},
								},
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
						"properties": map[string]any{"added": []any{"tag"}},
					},
				},
			},
		},
	}

	changes := Build(diff, base, target)
	if len(changes) != 1 {
		t.Fatalf("expected 1 deduplicated change, got %d: %#v", len(changes), changes)
	}
	change := changes[0]
	if change.Category != "schema" || change.ChangeType != "added" {
		t.Fatalf("unexpected change: %#v", change)
	}
	if change.Component == nil || *change.Component != "Pet" {
		t.Fatalf("expected Pet component, got %#v", change.Component)
	}
	if change.TargetPointer == nil || *change.TargetPointer != "/components/schemas/Pet/properties/tag" {
		t.Fatalf("unexpected target pointer: %#v", change.TargetPointer)
	}
	if !change.NewValuePresent {
		t.Fatal("expected a new value")
	}
}
