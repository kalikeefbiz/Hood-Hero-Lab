# Who does what (owner direction 2026-11-22)

| Agent | Does | Doesn't |
|---|---|---|
| Claude | Look and map of the city (`src/strip/**`, `cityMap.ts`, `public/assets/**`, `art/**`); reviews and merges Codex PRs; tells Codex precisely what must be accomplished at each checkpoint | Gameplay wiring in `src/city/**` |
| Codex | Gameplay in `src/city/**`; engine and content (`src/systems/**`, `src/content/**`); tests | Edit Claude's folders; self-merge |
| Gemini (proposed, owner to confirm) | See below | Edit `src/strip/**`, `public/assets/**`, `src/board/**`; merge |
| Vesper (ChatGPT) | Art: batches of 10, front + angled view per building | Code |

## Oversight loop
1. Claude writes the target outcome and pitfalls (`docs/CODEX_CITY_BRIEF.md`), not the implementation.
2. Codex works in checkpoints and opens draft PRs early.
3. Claude reviews each checkpoint against the map and a phone-size screenshot, and replies with specific changes only.
4. Owner plays on the iPhone before the final merge.

## Where Gemini could help (proposed; branches `gemini/<name>`, PRs reviewed by Claude)
- **Content drafts inside Codex's schemas:** job text for the Reservoir homes (names, circumstances, loot pools for `res-home-*` with `targetId: null`), NPC lines. Codex or the owner approves canon.
- **QA:** play the strip at 390x844, write bug lists with screenshots and ids; write extra Playwright tests for Codex's flows.
- **Docs and audits:** read-only codebase audits, test coverage gaps.
- **Art references:** if Gemini produces images, it can supply building art batches like Vesper (front + angled view per building).
Same rule for everyone: IDs come from `cityMap.ts` and `locations.ts`; never invent canon.
