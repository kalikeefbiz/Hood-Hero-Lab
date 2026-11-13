# Contextual dialogue review

Scope: Lab main `6abb24c`, after #22 and #23 merged. One feature branch, `codex/contextual-dialogue`. No original repository or preview checkout used.

## Reviewed surfaces and decisions

- Chains: retained Mega's existing promise, clarification, leadership, buyback, recovery and abandoned-chain branches. A delayed Flacco gift now stops requesting recovery once the incident is over.
- Angels trio: retained the authored recovery/discount/full-price/nonfactor distinctions and personal-versus-faction conflict explanation. Removed the UI's extra speech quotation around this multi-speaker narrated scene.
- Quanny: membership explanation reflects affiliation; unaffiliated resolution no longer dereferences a nonexistent faction. Open business ends with a neutral goodbye, blocked/disputed business retains unresolved wording. Existing debt collection, false claims, hostility and consignment consequences remain unchanged.
- Crew: removed AP/pay formulas from offer speech, retaining amounts, scheduling and daily limits beside acceptance. Declining no longer makes the player say “No friendship penalty.” Existing availability/trust logic remains intact.
- Workplace: natural responses with effects in their detail text. Both ways of leaving the difficult shift disclose reliability and employer-respect consequences. Coworker help and extra pay remain distinct.
- Suppliers: internal agreement IDs and projected gross no longer come out of an NPC's mouth. Individual repayment controls retain balances/deadlines; purchase controls retain costs and projected gross. Leaving explicitly retains existing obligations. Asking about terms now changes the dialogue.
- Dangerous street encounters: affiliation disclosure belongs to introductions; concern acknowledgements belong to disputes. Family conversation has a relevant response. Departure from a dispute is described as an attempt, not a guarantee of safety. Debt speech checks current balances, and history speech recognizes settled conflict. Existing cause/status and exact debt terms remain in response details.
- Robbery aftermath: conflict cause is displayed as contextual information rather than interpolated as character speech. Existing sell-back, buyout, extortion, stolen-property and personal-beef mechanics and UI remain intact.
- Menu narration: supplier reaction/event summaries and narrated gift/trio scenes no longer receive an additional NPC speech quotation in EncounterScene. No layout or board wiring changes.

## Compatibility and canon

No IDs, save schemas, progression rules, response effect payloads, combat/economy/relationship calculations, or robbery probabilities changed. Context controls which existing street responses are offered. No new characters, histories, relationships or plot developments authored.

Canon boundary: the generic history encounter stores an event cause, not a bespoke NPC recollection. Character-specific accounts of each robbery, reconciliation, or faction dispute would need approved writing/canon; this patch presents the recorded cause separately rather than inventing one. Quanny's locked violent-work future storyline is left unchanged.

Cross-owner review: `src/ui/EncounterScene.tsx` has the narration quotation correction and a workplace footer that names the actual end-of-day consequence instead of the retired “Skip scene” label. Existing browser selectors follow the revised text, with their behavioral assertions preserved. Claude review required; no new board integration or assets.

## Validation

Final source was frozen before these checks. Latest Lab main was fetched and integrated before validation; it was already current at `6abb24c6e48997bc209450d87807233b93c27450`.

- `npm test`: **427 passed / 1 failed**, 26 files, 233.53 s. All **9 new contextual dialogue tests passed**. The sole failure was `src/tests/crew.test.ts` → `60 days seed 1: independent lives, occasional offers, real appointments, save/load and bounded growth`, exceeding its existing 5,000 ms timeout.
- Untouched latest Lab main, detached at the same SHA: `npx vitest run src/tests/inventory.test.ts src/tests/crew.test.ts -t 'two independent property safes|60 days seed (1|7):'`: **2 passed / 1 failed / 39 skipped**, 15.48 s. The identical crew seed-1 case exceeded the identical 5,000 ms limit. Inventory and crew seed 7 passed. `git diff --exit-code` passed on that baseline checkout. No test timeout or assertion was weakened.
- `npm run build`: **passed**, including TypeScript; Vite finished in 11.73 s with the existing large-chunk advisory and dependency annotation warnings.
- `npm run test:e2e -- tests/danger.spec.ts tests/employment.spec.ts tests/quanny.spec.ts --grep 'board street conversation|workplace scene consequence|intentional board visit' --workers=1`: **Chromium 3 passed; WebKit 3 launch failures** (2.3 min). These use the original iPhone 13 profile. WebKit cannot launch because the host lacks `libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libharfbuzz-icu.so.0`, `libmanette-0.2.so.0`, `libhyphen.so.0`, and `libGLESv2.so.2`. No WebKit gameplay assertions executed.
- After the final street-response condition and workplace-footer corrections, `npm run test:e2e -- tests/danger.spec.ts tests/employment.spec.ts --grep 'board street conversation|workplace scene consequence' --project=chromium-mobile --workers=1`: **2 passed**, 1.5 min. Covers real City encounters, contextual response availability, workplace consequences, reload and replay prevention.
- `git diff --check`: passed.

The full browser suite and physical iPhone Safari were not run. WebKit execution remains an environment limitation. The full unit suite is not wholly green; the sole final failure is independently reproduced on untouched main.

[Reviewed mobile workplace screenshot](../screenshots/contextual-dialogue/workplace.png).

Ready for Claude review/merge with the stated validation limits. No new board wiring, models, layout, or assets are needed. The PR remains unmerged and is not deployed.
