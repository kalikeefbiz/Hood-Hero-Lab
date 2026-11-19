# Reservoir walkabout playtest

Experimental branch `codex/immersive-city-prototype`, based on Lab main `db33c6a`.

## Play

[Owner-private playtest preview](https://hood-hero-reservoir-playtest.ghostframestudio.chatgpt.site)

Sites deployment succeeded on November 19, 2026. The preview uses the same gameplay source as this branch. Its hosting project is `appgprj_6afe8f17e29881919b74229fb459ccdf`. The official Lab deployment and Pages workflow are untouched.

Run `npm ci`, `npm run dev`, then open the local URL. The prototype uses its own manual and autosave slots by default.

Start a Southside character, close Cuzzo's opening conversation, select The Reservoir on City, then choose **Walk the Reservoir**. If a campaign already has an active conversation or street session, finish or defer it first.

Drag the movement pad. Keyboard arrows or WASD also move. Walk toward Quanny outside Lil Jay's until **Speak to Quanny** appears. Answer his existing affiliation question and close the conversation. Approach the storefront for **Shop at Lil Jay’s** and buy groceries. The purchase costs the existing 1 AP and $16.

Step out from the storefront and approach Quanny again. **Approach Quanny** starts the controlled run-in. Within 2.4 world units, speak respectfully or dismiss him disrespectfully. Backing away removes the speaking choices. Returning restores them. Reaching 7 units resolves the existing leave response. Escalation can create a lasting grievance or trigger the existing assault, hospital and police response rules.

Use **Return to board** to resume ordinary play. Loading always resumes the ordinary board. History and engine consequences persist.

## Implementation and Claude review

The owner authorized the board and presentation changes on this branch.

- `src/board/BoardRenderer.ts` adds direct movement to the existing player token, a damped elevated follow camera, substepped collision, range checks and a temporary 78-unit far plane / 1x pixel ratio. It restores the ordinary view on exit.
- `src/board/reservoirWalk.ts` derives the bounded market strip and blocked lots from the existing district grid. Lot interiors conservatively exclude buildings, fences and props. Walkable space covers the public street network around six commercial blocks.
- `src/board/ui/BoardStage.tsx`, `StreetControls.tsx` and `board.css` add the touch pad, proximity prompt and local labels. They suppress board picking and remote pins during walking. Movement resets on blur, cancellation, modal entry and teardown.
- `src/ui/App.tsx` adds a City entry point, the existing Quanny dialogue, market action cards and spatial danger responses. Arrival uses `moveTo`. Purchases use `performActionAt`. Replies use `respondEncounter`.
- `src/systems/Danger.ts` adds one guarded staging command that creates an ordinary living-danger scene for Quanny at the market. The existing engine owns motive, resolution, relationships, injuries, police and records. A saved ordinary scene prevents repeat staging.
- `src/persistence/SaveSystem.ts` changes only the branch's default slot suffix to `.immersive-city-prototype`. Existing serialization, migrations and explicit suffix overrides remain available. Player coordinates, camera, touch input and mode flags stay in memory.

The experiment is ready for Claude's compatibility review and owner playtesting. Keep it unmerged while the owner evaluates the direction.

## What is functional

Touch movement, keyboard movement, building-lot collision, following camera, local interaction range and approach visibility checks work through the City entry point. Quanny's canonical conversation and portraits use the existing encounter component. The shop shows existing item prices and AP costs. The controlled confrontation supports approach, movement out of speaking range, reapproach, retreat, peaceful resolution and escalation.

The city remains the same renderer and simulation. Walking changes no AP, day or campaign clock. The engine advances time through its existing commands. Escalation and retreat create ordinary saved encounter history. Returning to the board restores the logical market location.

## Limits and extension obstacles

The slice is Lil Jay's commercial strip. Other Reservoir locations remain accessible through ordinary gameplay. Entry uses the game's existing free location travel, then places the avatar on the market street.

Collision uses conservative lot boundaries. Entering yards, shop interiors and precise mesh collision need authored walkable surfaces and obstacle data. The player uses the existing configurable figure with turning and a small walking bob. NPCs use the existing rigged models or capsule fallback and existing board placement rules. Those placement rules can change a contact's slot after introductions.

The controlled run-in is deliberately staged through a new command using the existing danger scene. Its opponent stays at the canonical market position. There is no pursuit, hitbox combat or attack control. Evasion is physical distance and retreat. Injury and police consequences remain probabilistic engine outcomes. Reputation changes occur only where the existing engine awards them.

Nearby buildings retain their board proportions. Close views still expose simplified materials, exaggerated footprints and limited character animation. The confrontation panel can cover part of the scene on short portrait displays.

More neighborhoods need authored circulation and collision, consistent character-to-building scale, camera occlusion handling, stable NPC placement and measured asset budgets. The full city still loads in the same renderer. The short far plane reduces visible drawing, while startup cost and model memory still need device profiling.

## Validation

- `npm test` passed 445 existing tests across 29 files after the save default change.
- `npx vitest run src/tests/reservoirWalk.test.ts src/tests/previewSaves.test.ts` passed 5 tests. These cover staging guards, persistent injury consequences, serialization, blocked lots and save isolation.
- `npm run build` passed. Existing large-chunk and dependency annotation warnings remain.
- Mobile Chromium passed both escalation and retreat sequences with native touch drag, collision, NPC dialogue, exact AP/cash/event consequences, confrontation and reload.
- Mobile WebKit passed both escalation and retreat sequences at iPhone 13 size. Touch taps and keyboard movement were exercised. Chromium additionally exercised a native touch drag. Playwright WebKit lacks Chromium's touch-drag protocol.
- The browser checks include camera-follow and control-position assertions. A 30-frame Chromium sample at the confrontation averaged 16.58 ms between animation callbacks, about 60 callbacks per second. This short stationary software-rendering sample does not establish sustained movement frame rate. Physical iPhone thermal behavior, hardware frame rate and full-quality rendering remain unverified.

The local WebKit bundle required additional shared libraries. They were extracted under /tmp and its local launcher was adjusted to preserve LD_LIBRARY_PATH. Host requirement detection was skipped after supplying those libraries. Repository browser configuration was preserved.

A Chromium retreat rerun passed after correcting a diagnostic that read the lazy renderer before loading finished. An earlier parallel run lost its shared preview server when the other suite exited. Final cases ran with an available server.

The full browser regression suite has not been run. The focused acceptance checks and existing engine suite are the validation scope.

## Demonstration

[Mobile Chromium recording](media/reservoir-demo.webm)

[Confrontation screenshot](media/reservoir-confrontation.png)
