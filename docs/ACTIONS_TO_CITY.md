# Retiring the Actions menu: everything happens in the city

**Direction (from the game's owner, Nov 2026):** players spend their time in the
city. Every action is done at a place or with a person on the board. The
Actions tab is being made obsolete; at most a few read-only summaries survive,
and those move to Wallet or Set. New features are wired to the city first and
are never added to the Actions menu.

This document lists what the Actions tab offers today, where each item lives in
the city already, and what has to be built before the tab can go.

## Audit (Lab main, 5 Nov 2026)

| Actions tab item | Action types | In the city today | What's missing |
|---|---|---|---|
| **Streets** · stock on hand, debts, street spots list (`StreetWork`) | — (status) | Trapping only starts at a street spot (`links.street`: The Lot, Angels mural, Boarded house, Nawf Ave station). Plugs and packs: district card "Plugs in …", your card "Your plugs", plug's card (`PlugEntry`). | The status readout (stock, owed, due day, heat) has no city home. → a compact **"On hand" strip on your own card** (`PresenceCard`), and the full ledger in Wallet. |
| **Streets** · quiet afternoon | `rest` | Place cards at home-district rest spots (`links.rest`: towers, rowhouses, courtyard, homes, projects). | Nothing. Remove from the tab. |
| **Honest** · apply, accept, clock in, time off, quit | `apply` `acceptJob` `work` `timeOff` `resign` | Place cards for every job (`links.job`): 5 retail stores and the warehouse. | Schedule, absence warning and income summary (`EmploymentSummary`, `absenceWarning`) → show on the **workplace's card** and in Wallet. |
| **Honest** · gigs | `gig` | Place cards at Downtown docks and Nawf street market (`links.gig`). | Nothing. |
| **Connects** · contact picker | — | People stand at people spots and are tapped on the board; district cards list who's around (`placePeople`). | **Downtown has no people spot**, so its resident is off the board. Add one or two Downtown people spots. `boardPeople` caps residents at 8 per district; as the cast grows, known contacts must always make the cut. |
| **Connects** · moves with a person | `contact` `inquire` `introduce` `socialize` `favor` `offer` `transfer` `standing` `affiliate` `settlement` `recruit` `remove` | Person card shows moves aimed at them, **but only the first 6** (`PersonInspector` `.slice(0, 6)`); some characters have 12. | Show **every** move on the person card, grouped (Talk · Business · Crew), so nothing is reachable only from the tab. |
| **Connects** · plug offer | supplier conversation | Done: plug's card on the board, deals return to the board. | — |
| **Connects** · Quanny | `quanny` | Quanny's known location (`placeActions`). | Nothing. |

**Other menu-style shortcuts outside the Actions tab** (the same rule applies):

| Where | What | City home |
|---|---|---|
| Wallet · "Personal purchases" | `buy` | Already sold at shops (`links.items`). Remove the shortcut once shops are the only way to buy. |
| Wallet · "Discuss repayment" | supplier conversation | The plug's card. Keep a read-only debt line in Wallet that points to where the plug is. |
| Set · businesses | `businessAction` | Block and place cards already carry business actions; keep Set as the overview. |
| Set · organization, retirement | — | Overview screens; fine to stay. |

## Order of work

1. **Person cards show all moves**, grouped. *(Claude: board UI)*
2. **Downtown people spots**, and known contacts always placed on the board. *(Claude: board)*
3. **"On hand" strip on your card**; employment summary on workplace cards. *(Claude: UI)*
4. Remove Streets, Honest and Connects from the Actions tab one group at a
   time, each with a browser test proving the action works from the city.
   Wallet's purchase and repayment shortcuts go the same way.
5. Retire the tab; any surviving read-only summaries live in Wallet or Set.

## Rule for all new work

Every new feature answers **"where in the city does this happen, and with
whom?"** before any UI is built. It gets a place (`LocationDef.links`), a
person (moves on their card), or a board object. Then it gets a browser test
that does it from the City tab. See `AGENTS.md`.
