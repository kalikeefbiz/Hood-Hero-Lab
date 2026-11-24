# AGENTS.md — Hood Hero Lab collaboration rules

These standing instructions apply to all coding agents working in **kalikeefbiz/Hood-Hero-Lab**. Read them before editing. They protect the shared playable Lab and coordinate Claude (world presentation), Codex (gameplay), and Gemini (NPC simulation). The project owner has final authority over scope and release decisions.

## 00. Current direction (owner decision 2026-11-20; overrides anything below that conflicts)

Read `docs/CITY_PLAN.md`. Summary:

- **The old board (`src/board/**`) is frozen.** No features, content, fixes or visual changes there. Only a bug that breaks saves or stops the game running may be fixed, and say so in the PR. The game engine, saves, characters and rules stay where they are and keep working.
- **The new city is built street by street in `src/city/**`** (seed: `src/strip/`), sharing the same engine and saves. The Reservoir comes first (4 to 6 streets), then Southside, Eastside, Northside, Downtown. A hood is done when everything in the game is playable in it: locations, NPCs, player interactions, shops, crime locations, encounters.
- **Current split, locked 2026-11-22:** Claude owns physical world, map and visual presentation; Codex owns canonical gameplay systems and location action API; Gemini owns NPC simulation, schedules, navigation, and authoritative NPC presence. See **section 00A**. This overrides historical two-agent assignments below.
- **Claude owns the look and the map**: `src/strip/**` (scene, streets, buildings, camera look, lighting, loading, `layout.ts`, and the gameplay map `cityMap.ts`), `public/assets/**` (models, textures), `art/**`. Claude places doors, walls, fences, NPC spots and the player start in `cityMap.ts`, and decides where each feature physically happens.
- **Codex owns gameplay contracts and resolution**: `src/city/**` location action API, `src/systems/**`, `src/content/**`, `src/core/**`, validation, economy, crimes, encounters, faction consequences, relationships and saves. **Claude owns player walking/running, touch controls, player collision runtime and camera follow**; these are not Codex tasks.
- **Per-street loop**: owner locks canon, Claude builds physical streets and map anchors, Codex wires real gameplay actions, Gemini supplies NPC autonomy after its integration is authorized, owner playtests and approves merge. Claude develops the player-controller foundation alongside the physical world; final protagonist integration may come later.
- Codex reads but does not edit `src/strip/**`, `public/assets/**` or `art/**`. Need a door, a wall fixed, an NPC spot, a storefront made a real place? Ask in the PR by location/character id; Claude updates `cityMap.ts`. Brief: `docs/CODEX_CITY_BRIEF.md`.
- Anywhere below that says "on the board", read "in the city".

## 00A. Three-agent boundaries and current integration contract (owner-approved 2026-11-22; overrides conflicting text anywhere in this repository)

**ONLY active development repository:** `kalikeefbiz/Hood-Hero-Lab`. `kalikeefbiz/Hood-Hero` is frozen and must not be touched. **Authoritative canon:** `docs/RESERVOIR_CANON.md`. **Physical map:** `src/strip/cityMap.ts` (Claude). **Gameplay contract in review:** PR #51, `src/city/LocationInteractions.ts` and `docs/RESERVOIR_GAMEPLAY_WIRING.md` (Codex); these files exist on the PR branch until merged, not necessarily on `main`.

| Agent | Owns | Must not implement without a newly approved task |
| --- | --- | --- |
| **Claude** | Physical geometry, buildings, sidewalks, doors, fences and anchors in `src/strip/**`, visual rendering, lighting, asset presentation, interface that displays engine-returned actions/results, player movement/touch controls/collision/camera follow and physical interaction-range detection | NPC decisions, schedules, pathfinding, autonomous movement, social AI, action resolution, new game rules |
| **Codex** | Canonical game rules, item/cash/inventory/relationship/faction effects, eligibility, persistent state, jobs/crime/businesses, presentation-free location gameplay API in `src/city/**`, rule tests | Geometry, city map, renderer, NPC world scheduler/pathfinding, player movement/controls/camera |
| **Gemini** | Independently prototyped NPC movement/navigation, schedules, behavior, NPC-to-NPC interaction decisions, population persistence and runtime presence/co-presence | Game engine truth/economy/relationship resolution/saves, visual renderer and approved assets, player controls; **no repo edits yet** until integration scope/access explicitly approved |

**Player movement and controls (owner decision 2026-11-22): CLAUDE.** Claude owns the reusable player controller, walk/run, iPhone touch input, player collision with authored world geometry, camera follow/occlusion, player locomotion-animation presentation and physical interaction-range detection. Implement within Claude-owned `src/strip/**` and approved assets, using a temporary avatar until the protagonist model lands. The male protagonist model is in production (owner-directed 2026-11-24): Gemini builds it under `docs/handoff/protagonist-male.md` (modular: body, swappable heads and complexions); Claude reviews it and wires it into the player avatar. Expose a stable read-only interface for player position, movement state and nearby anchors. Codex remains solely responsible for action eligibility, costs, consequences, economy and canonical saves; Claude must call its public API rather than duplicate rules. Gemini owns NPC autonomy, navigation, locomotion decisions and presence; it can consume approved map geometry but does not control the player. No competing movement engine, new board mode or save schema. Historical Codex movement assignments are superseded.

**Production NPC presence:** Gemini will determine actual NPC coordinates and co-presence; the host supplies **verified `peopleHere`** to Codex's location API. Neither Claude's static `NPC_SPOTS` nor legacy story-location assumptions are a permanent substitute. Claude may use *explicit isolated preview fixtures* derived from map NPC spots (including a temporary Mr. Lewis market anchor), but must label them fixtures and keep them out of gameplay and saves. Claude **does not implement NPC behavior**. Claude renders a character and its approved animations from authoritative state; Gemini determines the behavioral/locomotion state, not the Three.js scene.

**Preview position:** Claude may use a **developer-only location selector with isolated throwaway state** for API testing; never teleport a real save or make it a permanent gameplay shortcut. The separately scoped controller preview must demonstrate temporary-avatar walking/running, iPhone touch control, world collisions, camera following and physical approach to approved anchors, using real Codex API outputs. Explicit NPC fixtures remain labeled as test-only and never become production presence.

**File seam:** Claude's presentation adapter lives in Claude-owned `src/strip/**`; it **imports** Codex's public API from `src/city/**` after #51 merges. Codex does not edit `src/strip/**`. Gemini consumes canonical maps and game state when integration is authorized; it does not install its own renderer or write authoritative game state.

**Review order:** (1) Claude reviews PR #51 compatibility and merges only if clean; (2) Claude builds separate visual-anchoring PR after rebasing onto merged `main`; (3) Gemini validates independent five-street simulation using real destinations and action contracts; (4) Claude implements a separately scoped controller foundation and iPhone preview when scheduled, without blocking PR #51 review or visual integration. No new camera-board prototype and no old `src/city3d/**` revival.

**Docs hygiene:** Whenever the owner changes responsibility or architecture, the coordinating agent **must update `AGENTS.md` and any conflicting active task brief before issuing an implementation handoff**. An in-chat decision alone is not sufficient. Existing safeguards about branches, PRs, saving, production isolation, and mobile-first testing still apply.

## 00B. Lab saves are disposable test data (owner decision 2026-11-23; overrides save-compatibility wording anywhere below)

Every save in Hood-Hero-Lab belongs to the owner's own playtesting. None needs preserving.

- **No migrations or backwards compatibility for Lab saves.** A schema, id or state change may wipe or reset existing Lab saves. Prefer a clean break (bump the version, discard what doesn't match) over migration code. Do not spend effort keeping old Lab campaigns loading.
- **Ids may change when that makes the game better.** Location, household, character and anchor ids are still contracts *between agents*: change them in one coordinated PR that updates every reader. They are not save-compatibility constraints.
- **One thing must keep working: getting past the opening.** The owner must always be able to reach the open city beyond the opening storyline (Mega's chains) without replaying it. A dev "start after the opening" option or a fresh test save is fine. Keeping old saves alive is not required.
- **Production is unchanged.** `kalikeefbiz/Hood-Hero`, its site and its save keys stay frozen and protected (section 1). Lab must keep using its own save keys and never touch production ones.
- In PRs, "save impact" means: does it wipe Lab saves (fine, just say so), and does the owner still get past the opening.

## 00C. Character models (owner decision 2026-11-23)

Codex and Gemini build character models (mesh, rig, idle/walk/run) by following `docs/CHARACTER_PIPELINE.md` exactly, using Meshy, Blender 5.3 and the pinned `EL4CTEO/blender-skills` agent skills. They write **only** to `art/incoming/<id>/`, which is an exception to Claude's `art/**` ownership for that folder alone. They never edit `public/assets/**`, `src/**` or `characterModels.ts`. A delivery must pass `node scripts/check-character.mjs art/incoming/<id>`. Claude reviews it in the city, moves it into place and wires it up. Only canonical character ids with owner-approved art.

## 0. The city comes first (read this before designing anything)

The Actions menu is being retired. Players do things **in the city**: at a
place on the board, or with a person standing on it. Menus may keep
**information** (statuses, skills, activity feed, ledgers, context), but not
**actions** that shortcut the city. See `docs/ACTIONS_TO_CITY.md`.

For every new feature:

1. **Decide where it happens.** Choose a place (`LocationDef.links` in
   `src/board/locations.ts`, read by `placeActions` in
   `src/board/interactions.ts`), a person (an action whose `target` is that
   character, so it shows on their card), or both. Say which in the PR.
2. **Do not add action buttons to `ActionsHub`, Wallet or any other menu.** If
   no place fits, add stable game data and request the place or board object
   from Claude in the PR (see section 2).
3. **Share the rules, not copies.** An interaction shown in more than one spot
   lives in one component or function (example: `src/ui/PlugEntry.tsx`).
4. **Test it from the City tab.** Add a Playwright test that starts on the
   board, finds the place or person, and completes the action.
5. **Show what changed hands.** Anything that moves merchandise or cash appears
   in the exchange feed (`src/ui/exchanges.ts`), which only reads the records
   your system writes. Never calculate or award anything in the UI.

## 1. Repository and deployment boundaries

- **The bigger city is the official game.** Since 2026-11-13 it lives on `main`; the old `claude/city-expansion` branch and the `/next/` preview are retired. Build every feature against it.
- **Hood-Hero-Lab/main is the shared, playable integration branch.** It deploys automatically to https://kalikeefbiz.github.io/Hood-Hero-Lab/ on push. Do not use main as a development worktree, push unfinished work to it, or publish experimental changes directly.
- **Codex works on codex/<short-feature-name> branches. Claude works on claude/<short-feature-name> branches.** Create each feature branch from the latest Lab main, not from a stale feature branch, unless explicitly coordinated.
- Work-in-progress commits belong on the agent's feature branch. Push the feature branch and open a pull request **targeting Lab main** only when ready for review.
- **Codex must not merge its own pull requests. Claude reviews and merges Codex's PRs** after checking board/3D compatibility, unless the project owner explicitly authorizes another integrator for a particular PR. A completed Codex task means a review-ready PR, not a deployed feature.
- Before opening a PR, fetch the latest Lab main, integrate it into the feature branch (merge or rebase as appropriate), resolve conflicts **on that feature branch**, and rerun validation against the updated branch. Do not overwrite other agents' changes; avoid force pushes to shared refs. If an integration conflict cannot be resolved safely, report it in the PR and stop.
- **Do not change kalikeefbiz/Hood-Hero or its production site**, copy Lab back into production, or modify production save keys without the project owner's explicit instruction. The separate Hood-Hero development branch is a frozen backup, not an integration target.
- Do not change the Pages deployment workflow, the Lab base URL, or the automatic main-branch deployment policy as part of unrelated features.

## 2. File ownership and coordination

### Claude — city look, 3D and map owner (old `src/board/**` is frozen; see 00 for the current split)
- src/board/**, including locations, people placement, board interaction/presentation wiring, rendering, camera and layout.
- src/board/ui/** and board-specific CSS or visuals.
- public/assets/models/**, including GLBs, rigged characters, animation clips and shared environmental assets.
- Board and renderer tests, 3D performance, model loading, and environment presentation.

### Codex — rules, narrative and content owner
- src/systems/** and src/content/**: canonical game rules, faction logic, NPC action outcomes, economy, story, encounters and content. **Gemini owns NPC runtime schedules/navigation/behavior; Codex owns the engine consequences.**
- src/core/** except explicitly shared state contracts noted below.
- Gameplay, encounter and simulation tests; authoring/validation of content and approved portrait assets.
- public/assets/characters/** and portrait mapping/expression selection in existing UI helpers, without redesigning board layouts.

### Shared or cross-cutting — coordinate and minimize changes
- src/ui/App.tsx and other application-level UI: only targeted changes necessary to expose gameplay, with no broad layout refactors. Claude owns the board's appearance; Codex owns the gameplay being displayed.
- src/core/GameState.ts, src/persistence/**, save schemas and storage: narrowly scoped changes with tests. Lab saves are disposable (00B): say if a change wipes them; no migration needed.
- src/board/locations.ts, src/board/people.ts, src/board/interactions.ts and board components: **Claude-owned even when a new gameplay feature needs a location, NPC, or interaction shown on the board**. Codex should add stable game data and document the board integration request in its PR. Claude makes/approves the board wiring. Do not circumvent this rule by moving board behavior into gameplay modules.
- tests/** and src/tests/**: ownership follows the behavior being tested. Coordinate when a test changes someone else's board or shared UI assumptions.
- If a task genuinely requires touching another agent's files, keep the diff minimal, explicitly identify the cross-owner change in the PR, and obtain owner/Claude review. Do not silently reorganize or overwrite another agent's area.
- Agent ownership is a coordination rule, not permission to ignore broken integrations. Flag missing board wiring, visuals or assets clearly rather than claiming feature completeness.

## 3. Stable integration contracts

- Prefer **data and persistent IDs** over duplicating renderer logic. Game rules own character records, state transitions, encounter eligibility, outcomes and save data. The board reads this state and renders it.
- Keep character and location IDs stable; coordinate new IDs before board hookup. Example: Quanny's canonical character ID is **quanny** and his contact location is **reservoir.lil-jays**. His model can be resolved from the same character ID without gameplay code loading GLBs.
- Do not change a canonical ID, location registry key, dialogue choice ID or save-state field casually: other agents read them. Change one in a single coordinated PR that updates every reader. Existing Lab campaigns need not survive it (00B); document deliberate schema changes.
- Respect the new walkable-City direction and real location/presence rules. The old 3D strategy board is frozen. Do not introduce a parallel UI, encounter engine, NPC placement system, or rendering pipeline.
- For character portraits, use the established portrait components and approved art only. Do not introduce new expressions or substitute images without approval.

## 4. Required agent workflow

1. **Inspect:** check current Lab main, open PRs and relevant code/tests. Confirm that the planned files fall within your ownership area. Identify any board/3D dependency before coding.
2. **Branch:** create or update a named personal feature branch from fresh Lab main. Never code directly on main.
3. **Implement:** keep scope contained, use the existing APIs, preserve established rules and approved art, and commit focused changes to the agent branch.
4. **Integrate upstream:** fetch Lab main again before PR; incorporate its latest changes into your feature branch. Resolve all merge conflicts there; do not discard Claude's work or revert unrelated commits.
5. **Validate:** run at minimum npm test and npm run build. Run relevant targeted Playwright tests (npm run test:e2e -- <test-file>) and, when feasible, the full browser suite across Chromium and WebKit. Verify iPhone-sized layouts and save/load if affected.
6. **Handle red tests accurately:** do not describe the entire suite as passing if it is red. To claim an existing baseline failure, reproduce that specific case against the untouched latest main (and name the engine/case). Treat unverified failures as unresolved. Do not disable, delete or weaken tests just to pass.
7. **Open PR to Lab main:** include changes, behavior, affected areas, exact command/results, remaining failures and baseline evidence, save impact, board/Claude integration needs, branch/commit SHA and screenshots when visual.
8. **Handoff:** report the PR link and clearly say **ready for Claude review/merge**. Stop: no Codex self-merge, main push or direct deployment. Once Claude merges, verify the main-triggered Lab deployment before calling the public feature live.

## 5. PR integration checklist

Every Codex PR should answer:

- What player-facing behavior was added or fixed? What was deliberately left out?
- What stable IDs, state fields or save behavior changed? Does it wipe Lab saves (allowed, 00B), and can the owner still get past the opening?
- Does Claude need to wire up a board location, visible NPC, model, animation, UI layout, camera or visual asset?
- Which tests passed, which failed, and which failures are independently confirmed on main?
- Is this ready to merge without breaking the current board, UI and existing encounters?
- Is the work still unmerged and therefore not yet present on the public Lab?

If cross-owner integration is unfinished, label it clearly as a dependency; do not request merge as if the whole feature were complete.

## 6. Safety and ownership of content

- Follow the project owner's game canon, approved narrative and artwork. Don't invent new characters, missions or faction rules merely to fill gaps in an assigned feature.
- Keep authored dialogue/portraits editable using the established content infrastructure where available. Never use unapproved imagery.
- Never commit credentials, tokens, private user details, local workstation data or external personal information to this public repository.
- Do not modify GitHub repository rules, CI protection or release process without explicit authorization.

**Bottom line:** Codex produces a reviewed gameplay/content PR. Claude integrates board/3D changes and merges after compatibility review. The owner decides scope and when Lab is ready to move into the original Hood-Hero production repository. Gemini owns NPC world simulation, but has no repository write assignment yet; player movement/controls ownership belongs to Claude; the male protagonist model is in production under `docs/handoff/protagonist-male.md`.


## 7. Mobile-first

- The owner plays and reviews on an iPhone. Design for a ~390 px-wide screen.
- Tap targets are at least 44 px.
- Nothing a player needs may sit under the bottom nav or the top HUD.
- Avoid main-thread work on every frame or every render; the board already
  carries a large map.
