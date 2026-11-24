# Player controller (Claude)

The reusable walking controller for the city. Code lives in `src/strip/player/**`, the walk-mode host in `src/strip/walk.ts`, and the preview in `strip.html`. Ownership follows `AGENTS.md` 00A (owner decision 2026-11-22).

## Pieces

| File | Does | Depends on |
| --- | --- | --- |
| `player/controller.ts` | Walk/run speed, camera-relative steering, facing, collision, arrival/leave at anchors. Pure TypeScript, runs headless. | `anchors.ts`, `player/collision.ts` |
| `player/collision.ts` | Circle vs `WALLS` rects, `FENCES` segments, people (circles) and `WALK_BOUNDS`. Sliding, sub-stepped so nothing tunnels. Also `firstWallHit` for the camera. | `cityMap.ts` |
| `player/avatar.ts` | Loads a rigged model plus idle/walk/run clips and blends them by motion, with foot speed matched to ground speed. `AvatarSpec` swaps the character. | three.js |
| `player/followCamera.ts` | Third-person follow camera. Drag orbits, pinch zooms, it eases back behind you while you walk, and pulls in when a footprint would hide you. | `collision.ts` |
| `walk.ts` | Touch stick and WASD (Shift runs), the "Go in / Talk to" prompt, and wiring to the engine-backed place card. | all of the above, `preview.ts` |

## Interfaces others can rely on

```ts
interface PlayerView {          // controller.view(): frozen snapshot
  x: number; z: number;         // metres, cityMap coordinates
  heading: number;              // radians about +Y, 0 = +Z (same as cityMap facing)
  speed: number;                // m/s actually travelled
  motion: "idle" | "walk" | "run";
  nearby: CityAnchor[];         // anchors whose radius contains the player, nearest first
}
controller.onArrive(anchor => …)   // fires once when the player enters an anchor's radius
controller.onLeave(anchor => …)
```

- **Position and motion:** use `view()`. Nothing outside the controller writes position. `place()` exists for spawning or restoring at a door, not as a gameplay teleport.
- **Arrival:** being near a door only offers it. Using it (tapping "Go in") calls the engine's normal `moveTo` and then Codex's `queryLocation`. Walking past a door never triggers arrival hooks.
- **Codex:** the engine decides eligibility, costs and outcomes. The controller only says where the player physically is.
- **Gemini:** the NPC simulation can import `resolveCircle`, `moveCircle`, `blocked` and `MAP_SOLIDS` from `player/collision.ts`, and `anchorsAt` from `anchors.ts`, so NPCs and the player agree on what is solid and what counts as "at a door". The controller never moves NPCs. NPCs at their spots are solid circles for the player.

## Player avatar: the male protagonist

The player is the male protagonist (`protagonistMale()` in `src/strip/player/avatar.ts`).
- **Files:** `public/assets/models/characters/protagonist-male/`. Sources and previews are in `art/source/hood-hero/protagonist-male/`; the contract is `docs/handoff/protagonist-male.md`.
- **It's modular:** one headless body carries the rig and the `Idle`/`Walk`/`Run` clips. A separate head (`heads/face-0N.glb`) is rebound to the body's bones by name, so it follows every clip. A matching body skin texture (`complexions/complexion-0N.ktx2`) replaces the body's base colour.
- **Heads:** `face-01` by default. `strip.html?face=face-02` previews another head. Choosing a head for real is a character-creation and save decision, which belongs to Codex, and isn't built yet.
- **Speeds:** the clips were authored at 0.79 m/s (walk) and 2.55 m/s (run). Playback speeds up to 2.1× (walk) and 1.7× (run) to match the player's 1.6 and 4.2 m/s, so the feet don't slide.
- **Not final:** no clothing, hair or footwear yet; those parts come later on the same skeleton.

`TEMP_AVATAR`, the grey Mega mannequin, is still exported for comparisons. Any `AvatarSpec` can be passed as `WalkHost.avatar`.

## Speeds and feel

- Walking tops out at 1.6 m/s. Running is 4.2 m/s, past 82% stick tilt; the knob turns orange.
- The player radius is 0.3 m.
- The camera sits 5.2 m back at 0.34 rad pitch, and pinch zooms it between 2.2 and 11 m.
- The view lifts above the place card when the card is open.

## Preview modes (`strip.html`)

- Default: **walk**. The player controller is active, and pins only point the way (tapping one shows a hint and never moves you).
- `?select`: the developer location selector (PR #54), with an orbit camera, tap-to-stand and the Places list.

Both run on the same in-memory test campaign. Nothing is saved.

## Known limits

- Collision uses the authored footprints, fences and people only. Props such as lamp posts and hydrants are not solid yet.
- The camera's occlusion test assumes a roof height per footprint (7.5 m for houses, 9 m for the warehouse, 30 m for the tower) instead of reading meshes.
- Measured only in headless Chromium with software WebGL. It has not run on an iPhone yet, so device frame rate is unknown.
