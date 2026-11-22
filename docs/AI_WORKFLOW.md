# Who does what (owner direction 2026-11-22)

| Agent | Does | Doesn't |
|---|---|---|
| Claude | Look and map of the city (`src/strip/**`, `cityMap.ts`, `public/assets/**`, `art/**`); reviews and merges Codex PRs; tells Codex precisely what must be accomplished at each checkpoint | Gameplay wiring in `src/city/**` |
| Codex | Gameplay in `src/city/**`; engine and content (`src/systems/**`, `src/content/**`); tests | Edit Claude's folders; self-merge |
| Gemini | NPC world simulation in `src/sim/**` (schedules, sidewalk pathfinding, interruptions, off-view state) and `src/render/AvatarAdapter.ts`; brief: `docs/GEMINI_SIM_BRIEF.md` | Edit `src/strip/**`, `public/assets/**`, `art/**`, `src/board/**`, `src/city/**`; merge; own relationships or time (engine does) |
| Vesper (ChatGPT) | Art: batches of 10, front + angled view per building | Code |

## Oversight loop
1. Claude writes the target outcome and pitfalls (`docs/CODEX_CITY_BRIEF.md`), not the implementation.
2. Codex works in checkpoints and opens draft PRs early.
3. Claude reviews each checkpoint against the map and a phone-size screenshot, and replies with specific changes only.
4. Owner plays on the iPhone before the final merge.

## Gemini's lane (confirmed 2026-11-22)
Gemini builds the layer that makes people move like they live there. The engine (`src/systems/**`, `src/core/**`) still decides who exists, who they are to each other and what day it is. See `docs/GEMINI_SIM_BRIEF.md`. This table, not any other draft of AGENTS.md, is the source of truth for ownership.
