# Hood Hero Lab · Stixx City

Hood-Hero-Lab `main` is the official home of the bigger, walkable Stixx City. The Reservoir is the first neighborhood in the walkable build.

- Play: https://kalikeefbiz.github.io/Hood-Hero-Lab/
- City plan and clock integration: [City plan](docs/CITY_PLAN.md), [World clock V3](docs/WORLD_CLOCK_V3.md).
- Lab saves use `blackhouse.hoodhero-lab.v3` (schema 13), separate from production saves.
- To start a fresh campaign past The Chains opening, load the game with `?playtest=open-city` and select **Enter Stixx City**.

---

# Hood Hero · BLACKHOUSE

M1 — Core Simulation and First Playable. An iPhone-first, persistent, turn-based street-politics strategy game in fictional Stixx City. Built with TypeScript, Vite, React, Vitest and Playwright. No backend, accounts, multiplayer, external AI, or runtime network services. Fonts ship with the build.

## Run

Use Node 22.12+ (Node 24 also supported).

```sh
npm ci
npm run dev
```

Open the localhost URL displayed by Vite. Choose a home neighborhood, enter a name or leave it blank to play as Resident, then select **Enter Stixx City**. You begin unaffiliated with $125, 3 AP and Flacco in your personal Set. The clock runs during active City play on a 12-minute cycle (5 minutes of daylight and 7 minutes of night), with a refill to 3 AP at dawn (06:00) under normal conditions.

```sh
npm test                    # simulation fixtures and automated playthroughs
npm run build               # strict TypeScript check and production build
npm run preview             # serve dist locally
npx playwright install --with-deps chromium webkit
npm run test:e2e             # iPhone 13 emulation, Chromium + WebKit, narrow widths
```

On systems without browser dependencies or install privileges, Chromium may work while WebKit needs additional system libraries. See the exact validation environment in [M1 status](docs/M1_STATUS.md). Tests never silently skip a browser.

## First moves

In a regular new campaign, Cuzzo’s opening conversation introduces **The Chains**. If you close the conversation, select **The Chains** on the **City** screen to reopen it. You can ask around, work toward payment, negotiate, contact Pablo about a settlement, request Mega’s support, or attempt recovery. A shift earns $96 for 2 AP and a gig earns $38 for 1 AP. Both fit within the 3 AP daily allowance. Dawn charges $18 in living expenses, so starting cash plus one gig leaves you $5 short of the original $150 demand after dawn.

Helping is optional. Dawn advances NPC decisions and incident deadlines and normally refills AP to 3. Work, purchases, relationships, membership requests, recruitment, crew errands and city activity remain available after the dispute. There is no campaign day limit.

Use **City** for actions. Open a contact’s card on the City map for the social and crew actions available with that person. **People** shows both directions of trust. In the separate walkable Reservoir preview (`strip.html`), approach a mapped door and tap **Go in**, or approach someone at an interactive location and tap **Talk to** when it appears. The place panel shows the available actions. The Chains opening and the campaign clock are currently in the main game.

**Set** lets you manage crew membership and assign lawful errands. Influence expands capacity at 5, 15, 30 and 50, to a maximum of five members. Your Set never becomes a sixth gang.

## Save and resume

Every successful action and day advancement autosaves to this browser’s local storage. **Save** creates a manual checkpoint. **Load** and **Resume** prefer the manual checkpoint, falling back to autosave if no manual checkpoint exists. This permits trying an approach and restoring a checkpoint deliberately. A new game replaces autosave but leaves the manual checkpoint until you Save again.

There is one manual slot and one autosave slot, versioned and schema validated. No cloud sync. Clearing site data loses saves. Storage failures display a warning; play can continue in memory. Saves are tied to the browser origin, so localhost and a deployed preview have separate saves.

## Architecture and milestone scope

- [Implemented rules and architecture](docs/SYNDICATE_SYSTEMS.md)
- [Validation, limitations, deployment blocker and M2 priorities](docs/M1_STATUS.md)

React renders state; rules live in `core/` and `systems/`. The late-game wealth, authority, control and successor contracts have tested evaluators. M1 intentionally does not expose property acquisition, territorial warfare, rank advancement, formal retirement or succession controls, so full victory routes cannot yet be completed through normal UI play.

## Deployment

Current visual correction: [GOAL 002B screenshots and assessment](docs/GOAL_002B_VISUAL_CORRECTION.md).

GOAL 002 redesign details, verified artwork and historical screenshot review: [UI overhaul delivery](docs/GOAL_002_DELIVERY.md).

The repository includes CI and a manual GitHub Pages workflow that builds with `VITE_BASE_PATH=/Hood-Hero/`. The original M1 setup was blocked by an integration 403; on November 1, 2026, the Pages site is configured and serves the prior playable build. The `github-pages` environment allows deployments from **main only**. A feature-branch preview cannot pass that environment rule. The GOAL 002 handoff reports the actual workflow result; an existing live M1 site is not evidence that the overhaul deployed.

After the implementation is merged to main, run **Publish playable preview** from Actions. Verify its deployment output and the actual live bundle before claiming success. CI also publishes `playable-build` and `playwright-report` artifacts, including review screenshots. For another static host, upload `dist/`; set `VITE_BASE_PATH` at build time when hosting under a subpath.
