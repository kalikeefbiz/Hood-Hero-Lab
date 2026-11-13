# AGENTS.md — Hood Hero Lab collaboration rules

These standing instructions apply to all coding agents working in **kalikeefbiz/Hood-Hero-Lab**. Read them before editing. They protect the shared playable Lab and coordinate Codex (gameplay/content) with Claude (board/3D). The project owner has final authority over scope and release decisions.

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

### Claude — board, 3D and presentation owner
- src/board/**, including locations, people placement, board interaction/presentation wiring, rendering, camera and layout.
- src/board/ui/** and board-specific CSS or visuals.
- public/assets/models/**, including GLBs, rigged characters, animation clips and shared environmental assets.
- Board and renderer tests, 3D performance, model loading, and environment presentation.

### Codex — rules, narrative and content owner
- src/systems/** and src/content/**: game rules, faction logic, NPC agency, economy, story, encounters and content.
- src/core/** except explicitly shared state contracts noted below.
- Gameplay, encounter and simulation tests; authoring/validation of content and approved portrait assets.
- public/assets/characters/** and portrait mapping/expression selection in existing UI helpers, without redesigning board layouts.

### Shared or cross-cutting — coordinate and minimize changes
- src/ui/App.tsx and other application-level UI: only targeted changes necessary to expose gameplay, with no broad layout refactors. Claude owns the board's appearance; Codex owns the gameplay being displayed.
- src/core/GameState.ts, src/persistence/**, save schemas and storage: narrowly scoped, backwards-conscious changes with tests and a clear migration/compatibility note.
- src/board/locations.ts, src/board/people.ts, src/board/interactions.ts and board components: **Claude-owned even when a new gameplay feature needs a location, NPC, or interaction shown on the board**. Codex should add stable game data and document the board integration request in its PR. Claude makes/approves the board wiring. Do not circumvent this rule by moving board behavior into gameplay modules.
- tests/** and src/tests/**: ownership follows the behavior being tested. Coordinate when a test changes someone else's board or shared UI assumptions.
- If a task genuinely requires touching another agent's files, keep the diff minimal, explicitly identify the cross-owner change in the PR, and obtain owner/Claude review. Do not silently reorganize or overwrite another agent's area.
- Agent ownership is a coordination rule, not permission to ignore broken integrations. Flag missing board wiring, visuals or assets clearly rather than claiming feature completeness.

## 3. Stable integration contracts

- Prefer **data and persistent IDs** over duplicating renderer logic. Game rules own character records, state transitions, encounter eligibility, outcomes and save data. The board reads this state and renders it.
- Keep character and location IDs stable; coordinate new IDs before board hookup. Example: Quanny's canonical character ID is **quanny** and his contact location is **reservoir.lil-jays**. His model can be resolved from the same character ID without gameplay code loading GLBs.
- Do not change a canonical ID, location registry key, dialogue choice ID or save-state field casually. Preserve existing campaigns and historical records when adding content; document deliberate schema changes.
- Respect the existing 3D strategy-board architecture and real location/presence rules. Do not introduce a parallel UI, encounter engine, NPC placement system or rendering pipeline for a content feature.
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
- What stable IDs, state fields or save behavior changed?
- Does Claude need to wire up a board location, visible NPC, model, animation, UI layout, camera or visual asset?
- Which tests passed, which failed, and which failures are independently confirmed on main?
- Is this ready to merge without breaking the current board, UI, existing encounters and saved game?
- Is the work still unmerged and therefore not yet present on the public Lab?

If cross-owner integration is unfinished, label it clearly as a dependency; do not request merge as if the whole feature were complete.

## 6. Safety and ownership of content

- Follow the project owner's game canon, approved narrative and artwork. Don't invent new characters, missions or faction rules merely to fill gaps in an assigned feature.
- Keep authored dialogue/portraits editable using the established content infrastructure where available. Never use unapproved imagery.
- Never commit credentials, tokens, private user details, local workstation data or external personal information to this public repository.
- Do not modify GitHub repository rules, CI protection or release process without explicit authorization.

**Bottom line:** Codex produces a reviewed gameplay/content PR. Claude integrates board/3D changes and merges after compatibility review. The owner decides scope and when Lab is ready to move into the original Hood-Hero production repository.


## 7. Mobile-first

- The owner plays and reviews on an iPhone. Design for a ~390 px-wide screen.
- Tap targets are at least 44 px.
- Nothing a player needs may sit under the bottom nav or the top HUD.
- Avoid main-thread work on every frame or every render; the board already
  carries a large map.
