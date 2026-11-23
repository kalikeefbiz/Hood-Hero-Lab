# Living Reservoir (integration)

One playable preview with all three agents' systems together, in the existing five-street Reservoir.

| Layer | Owner | Where |
| --- | --- | --- |
| Streets, buildings, anchors, nav map, rendering, player controller, camera, touch | Claude | `src/strip/**` |
| NPC schedules, movement decisions, presence, interruptions | Gemini | `src/sim/**`, `src/render/AvatarAdapter.ts` |
| Actions, eligibility, costs, results, state | Codex | `src/city/LocationInteractions.ts`, engine |

## How it fits

```
touch stick ─► PlayerController ─► collision (WALLS, FENCES, NPC bodies)
                     │                     ▲
                     ▼                     │ sim positions
              anchorsAt / peopleNear ◄── LivingBlockSim (RESERVOIR_NAV_MAP)
                     │                     │ peopleHere
                     ▼                     ▼
           "Go in" / "Talk to …"  ─►  queryLocation / executeLocationAction
                                           │
                                  PlaceCard shows the engine's actions and results
```

- `src/strip/navMap.ts`: the authored graph Gemini's sim walks (contract in `docs/GEMINI_LIVING_BLOCK.md`).
- `src/strip/living.ts`:
  - starts the sim on that graph
  - draws each NPC from `AvatarAdapter` poses: Quanny with his approved rig and idle/walk/run clips, the rest as grey placeholder people with a facing marker
  - gives Codex's API the sim's `peopleHere`
  - keeps the sim in step with the engine day, player position and view (20 Hz while any NPC is within 60 m, 1 Hz otherwise)
- `src/strip/walk.ts`: the player controller (`docs/PLAYER_CONTROLLER.md`). NPCs are solid where the sim has them that frame.
  - The prompt offers the person beside you ("Talk to Quanny") when the sim has them at a place.
  - Otherwise it offers the door you're at.
  - Someone walking between places shows as "passing by"; the engine has no on-the-street conversations.
- `src/strip/simControls.ts`: a clock chip that opens a sheet with time speed (1×, 10×, 60×), "Cause a commotion here" (the sim's own disturbance event) and where everyone is. `#dev` also mounts Gemini's inspector.

The test campaign is in memory only (`newGame`), never saved.

## Hosted preview

Pages deploys only `main`, so the integration preview is hosted as a private claude.ai artifact. The build uses `VITE_BASE_PATH=./`. That host serves no `.glb`/`.ktx2`, so models and textures are shipped as `.json` (base64), and a small inline script in the hosted page hands the loaders the original bytes. The app code is the same as `strip.html`.

## Timing

The neighborhood clock runs at 3 game minutes per real second (1 game hour ≈ 20 s), and starts once your street has loaded. NPCs always walk at real speed; the 10× and 60× buttons fast-forward everything.
