# Retiring the Actions menu: everything happens in the city

**Direction (from the game's owner, Nov 2026):** players spend their time in the
city. Every **action** is done at a place or with a person on the board, so
there are no shortcuts. **Information stays in menus**: statuses, skills, the
activity feed, ledgers and anything else that gives context. New features are
wired to the city first and never get action buttons in a menu.

This document lists what the Actions tab offers today, where each item lives in
the city already, and what has to be built before the tab can go.

## Audit (Lab main, 5 Nov 2026)

| Actions tab item | Action types | In the city today | What's missing |
|---|---|---|---|
| **Streets** · stock on hand, debts, street spots list (`StreetWork`) | — (info: stays) | Trapping only starts at a street spot (`links.street`: The Lot, Angels mural, Boarded house, Nawf Ave station). Plugs and packs: district card "Plugs in …", your card "Your plugs", plug's card (`PlugEntry`). | Nothing: information stays in the menu. |
| **Streets** · quiet afternoon | `rest` | Place cards at home-district rest spots (`links.rest`: towers, rowhouses, courtyard, homes, projects). | Nothing. Remove from the tab. |
| **Honest** · apply, accept, clock in, time off, quit | `apply` `acceptJob` `work` `timeOff` `resign` | Place cards for every job (`links.job`): 5 retail stores and the warehouse. | Action buttons go; the schedule, absence warning and income summary stay in the menu as information. |
| **Honest** · gigs | `gig` | Place cards at Downtown docks and Nawf street market (`links.gig`). | Nothing. |
| **Connects** · contact picker | — | People stand at people spots and are tapped on the board; district cards list who's around (`placePeople`). | The picker is a shortcut to people anywhere in the city: remove it. *(The Downtown people-spot gap is set aside for now by the owner.)* |
| **Connects** · moves with a person | `contact` `inquire` `introduce` `socialize` `favor` `offer` `transfer` `standing` `affiliate` `settlement` `recruit` `remove` | Person card shows every move aimed at them (the 6-move cap was lifted in GOAL 011). | Group the moves (Talk · Business · Crew) so 12 moves stay readable. |
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

1. ~~Person cards show all moves~~ (done in GOAL 011); group them. *(Claude)*
2. ~~Downtown people spots~~: set aside by the owner.
3. ~~"On hand" strip~~: not needed, because information stays in menus.
4. Remove action buttons from the Actions tab and Wallet; keep every
   information panel. Each removed action has a browser test proving it works
   from the City tab. *(Claude, Nov 6)*
5. What's left of the Actions tab is information only. Rename or fold it into
   another tab once it's clear what remains.

## Rule for all new work

Every new feature answers **"where in the city does this happen, and with
whom?"** before any UI is built. It gets a place (`LocationDef.links`), a
person (moves on their card), or a board object. Then it gets a browser test
that does it from the City tab. See `AGENTS.md`.
