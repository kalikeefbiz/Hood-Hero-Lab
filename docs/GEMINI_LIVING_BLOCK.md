# Gemini — One Living Block (Implementation & Integration Contract)

Implements the headless, deterministic NPC autonomy simulation for **Lil Bit Lane** and its connected Reservoir destinations (`src/sim/**`) plus a renderer-agnostic `AvatarAdapter` (`src/render/AvatarAdapter.ts`), an isolated mobile-first developer preview (`src/sim/preview/`), and headless + phone-viewport tests.

No files in `src/strip/**`, `src/board/**`, `src/city/**`, `src/systems/**`, `src/content/**`, `src/core/**`, `src/persistence/**`, `public/assets/**`, or `art/**` were modified.


> **Integration changes (Claude, 2026-11-23; owner authorized reworking clashing parts).** The NPC simulation itself (schedules, decisions, movement, presence, interruptions, persistence) is unchanged. Changed around it:
> - **Nav graph:** the sim's default graph is now Claude's authored `RESERVOIR_NAV_MAP` (`src/strip/navMap.ts`, all five streets, same `door:`/`home:`/`spot:` ids). The derived builder was removed from `derivedNavMap.ts`, which keeps the id and collision helpers.
> - **Homes:** homes come from `HOUSEHOLDS` in `cityMap.ts` (Quanny → `res-home-03`, the Splash Gang bando; Mr. Lewis → `res-home-04`; test resident A → `res-home-01`).
> - **Nearest node:** `findNearestNavNode` skips nodes with no edges, so recovery can't start from an orphan.
> - **Shared destinations:** NPCs who share one stand side by side along the doorway (`settleSlot`), walking there, not stacked on one point.
> - **Assets:** `AvatarAdapter` asset paths are relative to the site root, so they work under `/Hood-Hero-Lab/`.
> - **Preview:** the separate canvas preview (`src/sim/preview/`) and its spec were removed. The sim runs in the real 3D city (`strip.html`, `docs/LIVING_RESERVOIR.md`), with the inspector under `#dev`.

---

## 1. Architecture & Files

| File | Responsibility |
|---|---|
| `src/sim/types.ts` | Core simulation state, `NavMap` contract, `PeopleHereEntry`, `EngineRelationshipAdapter`, `SimSnapshotV1`. |
| `src/sim/rng.ts` | Deterministic Mulberry32 `SeededRng` (no `Math.random()` or `Date.now()` in `src/sim/**`). |
| `src/sim/derivedNavMap.ts` | Derives an obstacle-verified sidewalk/crosswalk/door graph directly from `src/strip/cityMap.ts` (`WALLS`, `FENCES`, `DOORS`, `HOUSES`, `NPC_SPOTS`, `WALK_BOUNDS`), with circle-vs-AABB/fence collision helpers and explicit `missingConnections`. |
| `src/sim/pathfinding.ts` | Deterministic A* pathfinding with dynamic node blockage support. |
| `src/sim/schedules.ts` | Five distinct daily routines: 3 canonical Reservoir characters (`quanny`, `mr-lewis`, `resident-reservoir`) from engine character records + 2 clearly labeled anonymous test residents (`sim-resident-lilbit-04`, `sim-resident-lilbit-06`). |
| `src/sim/relationships.ts` | Read-only affinity cache + proposed delta emitter wrapping `src/systems/Relationships.ts`. |
| `src/sim/engine.ts` | `LivingBlockSim`: 20 Hz active / 1 Hz off-view fixed-step loop, schedules, brief social chats, path-conflict yielding, disturbance reactions, unreachable-route recovery, interrupt/resume stack, and `peopleHere` / `peopleNear` queries. |
| `src/sim/persistence.ts` | Versioned `SimSnapshotV1` serialization and backward-compatible `restoreSimFromSave` (legacy saves without `sim` boot cleanly). |
| `src/sim/inspector.ts` | `?dev`-gated developer inspector (dynamically imported only under `?dev`). |
| `src/render/AvatarAdapter.ts` | Interpolates 20 Hz sim poses at render FPS with pre-allocated pose buffers and maps locomotion states to approved character GLBs (`public/assets/models/characters/quanny*.glb`) or temporary avatars. |
| `src/sim/preview/*` | Isolated developer preview (`src/sim/preview/index.html`) for visualizing all 5 NPCs, nav graph, clock, disturbances, and off-view persistence on a 390×844 viewport. |

---

## 2. Navigation Contract for Claude (`src/strip/navMap.ts`)

**One-paragraph summary for Claude:** Please export a `RESERVOIR_NAV_MAP: NavMap` (matching `src/sim/types.ts`) containing sidewalk spine nodes, crosswalk nodes, door/porch anchors, and district portals for all five Reservoir streets plus Kirkwood St, with bidirectional obstacle-free edges carrying meter `cost` and corridor `width`. Every place anchor should carry its canonical `locationId` (e.g. `reservoir.lil-jays`, `reservoir.pawn`) and every house porch should carry its stable `homeId` (`res-home-01..16`), plus `facing` and `radius` matching `cityMap.ts`, while keeping `WALLS`, `FENCES`, and `WALK_BOUNDS` attached for runtime collision checks.

```ts
export interface NavNode {
  id: string;
  kind: "sidewalk" | "crosswalk" | "door" | "porch" | "portal" | "spot";
  x: number;
  z: number;
  street?: string;
  locationId?: string | null;
  homeId?: string | null;
  facing?: number;
  radius?: number;
}

export interface NavEdge {
  from: string;
  to: string;
  kind: "sidewalk" | "crosswalk" | "approach" | "portal";
  cost: number;
  width: number;
  bidirectional?: boolean;
}

export interface NavMap {
  version: 1;
  hood: ZoneId;
  source: "derived-from-cityMap" | "authored-navMap";
  nodes: NavNode[];
  edges: NavEdge[];
  obstacles: Rect[];
  fences: Segment[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  missingConnections: string[];
}
```

**Documented gaps in the current derived graph (`src/sim/derivedNavMap.ts`):**
- Scenery storefronts (`Reservoir Barber Shop`, `Liquor & Deli`, `Beauty Supply`, `No Refund Auto & Tires`) have `locationId: null` and are excluded as destinations until promoted in `cityMap.ts`.
- Baylor Ave (west-end N–S connector) and back-lot alleys are not yet authored in `cityMap.ts`; inter-street routes currently use Kirkwood St.
- Inter-district portals (Southside, Eastside, Northside, Downtown) await `src/strip/navMap.ts`.

---

## 3. Gameplay & Persistence Contract for Codex

- **One Clock:** Engine `GameState.day` is authoritative. Call `sim.syncEngineDay(state.day)` whenever the engine advances the day. The sim only tracks `minuteOfDay` (`0..1440`) and sets `clock.dayWrapPending = true` at midnight without incrementing a second `dayCount`.
- **Presence (`peopleHere`):** Read `sim.peopleHere(locationIdOrHomeId)` or `sim.peopleNear(x, z, radius)` to query which NPCs are physically at a door/home/point for interaction menus and encounters.
- **Relationships:** Pass `createGameStateRelationshipAdapter(() => state, onDelta)` into `LivingBlockSim`. The sim caches read-only affinity scores and emits non-authoritative `RelationshipDelta` proposals; `src/systems/Relationships.ts` remains the sole writer.
- **Player context:** Feed player coordinates, faction, and disturbance flags via `sim.setPlayerContext({ x, z, affiliation, disturbanceActive })` from `src/city/**`.
- **Save slot hook:** Store `extractSimSnapshot(sim)` (`SimSnapshotV1`) as an optional `sim` field inside the existing Lab save slot (do not create a separate save slot). On load, call `restoreSimFromSave(save, { engineState })` — legacy saves without `sim` load cleanly with `restoredFromSnapshot: false`.

---

## 4. Running Tests & the Isolated Phone Preview

### Headless Node tests (no WebGL)
```bash
npx vitest run src/tests/simLivingBlock.test.ts
```

### Isolated visual preview (390×844 phone-size viewport)
```bash
npm run dev
# Open on phone or browser DevTools (390×844):
# http://localhost:5173/src/sim/preview/index.html?dev
```
Controls: **Pause/Resume**, **Speed (1× / 4× / 15× / 60×)**, **Leave Block / Return Block** (verifies 1 Hz off-view persistence without resetting), **Disturbance** (verifies interrupt & resume/re-plan), **View: Lil Bit / Reservoir**, **Nav Graph**, **Inspector** (gated to `?dev` by default), and **Reset Seed**.

### Automated 390×844 Playwright verification
```bash
# With Vite dev server running on port 5179:
PLAYWRIGHT_PUBLIC_URL=http://127.0.0.1:5179 npx playwright test tests/sim-preview.spec.ts --project=chromium-mobile
```

---

## 5. Measured Performance & Hardware

Tested on **Linux 6.18.57 x86_64 · Intel(R) Xeon(R) CPU @ 2.30GHz · Node v22.23.5** (not a physical iPhone; physical iPhone profiling remains required once wired into the 3D strip):

- **Headless 20 Hz simulation + `AvatarAdapter.sync` (1,000 consecutive ticks, 5 NPCs):**
  - Average: **0.0347 ms / step**
  - 95th percentile: **0.0157 ms / step**
  - Max (cold-start JIT spike): **8.1519 ms**
- **Browser 390×844 Chromium mobile preview (`?dev` HUD readout):**
  - Steady-state active 20 Hz step average: **0.02–0.03 ms / step** (well inside the ~3 ms/frame combined sim + rig budget).

---

## 6. Explicit Limitations & Dependencies

- **3D rig & renderer wiring (Claude's responsibility):** `AvatarAdapter.ts` maps `quanny` to `/assets/models/characters/quanny.glb` + idle/walk/run clips, while the isolated preview uses 2D Canvas avatars so it does not touch `src/strip/**` or `src/city/**`. Wiring the simulation startup loop and 3D GLB rigs into `src/strip/main.ts` remains strictly Claude's responsibility alongside authoring `src/strip/navMap.ts`.
- **Gameplay-state & persistence interfaces (Codex's responsibility):** Codex provides the `SaveSystem.ts` `SimSnapshotV1` hook, `syncEngineDay(state.day)`, `EngineRelationshipAdapter`, player-context state, and `peopleHere` gameplay consumers without touching `src/strip/**` or the renderer.
- **Physical iPhone verification:** Performance has been verified in headless Node and 390×844 Chromium emulation on a Linux x86_64 VM, not yet on a physical iPhone.
- **Full-repo `npm test` baseline note:** On untouched `main` in this VM, 30/31 test files (452/453 tests) pass; `src/tests/skillsSessions.test.ts` (`365-day focused City simulation avoids instant mastery`) timed out at 60s under full parallel load.
