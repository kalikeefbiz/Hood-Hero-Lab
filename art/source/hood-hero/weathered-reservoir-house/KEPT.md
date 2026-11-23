# Weathered Reservoir house (kept for later)

Codex built this house and a standalone showcase page for it in PR #46. The owner decided
on 2026-11-23 to retire the showcase but **keep the house** for use in the city later.

Everything from the showcase is here unchanged, moved with `git mv`; nothing was deleted:
- `weathered-reservoir-house.glb` and `textures/` (color, normal, ORM, plus `generate.py`): the asset
- `house.ts`, `lot.ts`, `export.mjs`, `README.md`: how it was built and exported
- `preview.webp`, `review/`: renders
- `reservoir-house.html`, `main.ts`, `movement.ts`, `showcase.css`, `showcase-tests/`: the
  retired showcase page and its tests, kept for reference. They are outside the build and the
  test runs, and their relative imports no longer resolve, so treat them as archive.

To use the house in the Reservoir, Claude places the GLB in `public/assets/` and on a lot in
`src/strip/layout.ts`, adds its footprint to `cityMap.ts` `WALLS`, and checks its scale and
textures against the street's budgets.
