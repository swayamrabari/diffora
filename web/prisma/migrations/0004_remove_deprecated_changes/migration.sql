-- Deprecation is no longer part of the product. Remove any stored
-- field-level deprecated changes and recompute the denormalized count.
UPDATE "Comparison" AS comparison
SET
  "changes" = COALESCE(
    (
      SELECT jsonb_agg(item.change ORDER BY item.ordinality)
      FROM jsonb_array_elements(comparison."changes") WITH ORDINALITY AS item(change, ordinality)
      WHERE item.change->>'field' IS DISTINCT FROM 'deprecated'
    ),
    '[]'::jsonb
  ),
  "totalChanges" = (
    SELECT count(*)::int
    FROM jsonb_array_elements(comparison."changes") AS item(change)
    WHERE item.change->>'field' IS DISTINCT FROM 'deprecated'
  )
WHERE jsonb_typeof(comparison."changes") = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(comparison."changes") AS item(change)
    WHERE item.change->>'field' = 'deprecated'
  );
