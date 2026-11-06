# Working in Hood Hero Lab

Hood Hero (BlackHouse) is a mobile-first, turn-based street-politics game set in
Stixx City. This repo is the **Lab**, where the game is built and tested. The
production repo (`kalikeefbiz/Hood-Hero`) stays untouched until the owner says
to merge.

## Who does what

- **Codex:** gameplay functions (systems, rules, economy) and story content
  (encounters, characters, dialogue).
- **Claude:** the city board, 3D, assets, and UI presentation.
- If a change needs both sides, the side that owns the main part leads, and the
  PR says which files from the other side it touches and why.

## Branches and merging

- Codex works on `codex/<feature>` branches and opens PRs into `main`.
- Claude works on `claude/<feature>` branches.
- Never push to `main` directly, and never force-push a shared branch.
- Before opening a PR, merge the latest `main` into your branch and fix any
  conflicts there, keeping both sides' changes.
- Big board work may preview on its own branch (currently `claude/city-expansion`
  at `/next/`). Don't rely on code that exists only there.

## The city comes first (most important)

The Actions menu is being retired. Players do things **in the city**: at a
place on the board, or with a person standing on it. See
`docs/ACTIONS_TO_CITY.md`.

For every new feature:

1. **Decide where it happens.** Pick the place (`LocationDef.links` in
   `src/board/locations.ts`, read by `placeActions` in
   `src/board/interactions.ts`), or the person (an action whose `target` is
   that character, so it appears on their card), or both. Say which in the PR.
2. **Do not add entries to `ActionsHub`**, the Wallet "Personal purchases" list,
   or any other menu shortcut. If no place fits, add one to `LOCATIONS` (or ask
   Claude for a board object) instead of falling back to a menu.
3. **Share the rules, not copies.** When the same interaction is shown in more
   than one place, put it in one component or function (example:
   `src/ui/PlugEntry.tsx`) so the rules can't drift.
4. **Test it from the City tab.** Add a Playwright test that starts on the
   board, finds the place or person, and completes the action.
5. **Show what changed hands.** Anything that moves items or cash should appear
   in the exchange feed (`src/ui/exchanges.ts`). The feed reads the records
   your system writes; don't make the UI calculate or award anything.

## Saves and data

- Never change existing ids (characters, places, blocks, actions, merchandise).
- Old saves must keep loading. Add a migration in
  `src/persistence/SaveSystem.ts` when state shape changes, and a test for it.

## Checks before a PR

```
npx tsc --noEmit
npx vitest run
npm run build
npx playwright test --project=chromium-mobile <the specs you touched>
```

Some browser specs already fail on `main` (for example `city-menu.spec.ts:31`
and `mobile.spec.ts:84`). In the PR, say which failures also happen on `main`.

## Mobile-first

- The owner plays and reviews on an iPhone. Design for a ~390 px-wide screen.
- Tap targets are at least 44 px.
- Nothing a player needs may sit under the bottom nav or the top HUD.
- Avoid main-thread work on every frame or every render. The board already
  carries the big map.
