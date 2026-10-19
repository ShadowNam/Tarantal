---
paths:
  - "content/**/*.json"
  - "src/content/**/*.ts"
---

# Content and schema rules

- Every JSON file in `content/` has a Zod schema in `src/content/schemas.ts`; types come from
  `z.infer`. Schemas are strict: unknown keys fail (except `$comment`).
- Cross-references (biome → creature ids, run → biome/boss ids, charms → DSL vocabulary, crates →
  power-up/weapon ids) are checked in `tools/validate-content.ts`.
- Charm DSL vocabulary is fixed in docs/02-TECH-ARCHITECTURE.md §3.8. Adding a trigger, condition or
  action means: update the doc, the schema, the interpreter, and add a test.
- Keep a `version` field per file; bump it when the shape changes and add a loader migration.
- Positions in biome files use `u` (0..1 across the layer) and `y` (design px) so they work at any
  aspect ratio.
- After editing content run `npm run content:validate`; after tuning run the balance sim and paste
  the before/after summary.
