# Hood Hero · Season 1 story spine

The user's outline for Season 1, written up for Codex (story content and
systems) and Claude (board, scenes and presentation). The user owns the canon.
Where a line says **confirm**, ask the user before building it.

## Why this exists

The game already has good characters and storylines, but in play the story
only happens when a prompt pops up. The rest of the time the player is tapping
around the board. Season 1 gives the game a spine: a run of story beats that
play out while the player goes about their own business in the city. Each beat
has a time window rather than a fixed date. The city should hear about things
before the player is pulled in, and each beat should leave a visible mark on
the map.

## Timeline

| Beat | When | Must happen by |
|---|---|---|
| 1. The Chains | Day 1 | Fully resolved by Day 7 |
| 2. Substation altercation | Rumor on Day 8, scene on Day 9 | Day 9 |
| 3. Fallout (Blocc Boys vs. Angels) | Days 10–20 | ongoing |
| 4. The studio with Cuzzo | Day 21 (**confirm**) | Day 21 |
| 5. Flacco's push | After the studio, Days 22–28 | Day 28 |

### 1. The Chains · Days 1–7 (exists, needs restructuring)

- It already exists. Restructure it so that it **always starts on Day 1 and
  is finished by Day 7**, whatever the player does: helps Cuzzo, ignores him,
  or tries to get the chains back by force.
- Right now `BALANCE.incidentDeadline` is 8 days from the start, so it can
  still be going on Day 9. Pull the deadline, the price increases and Pablo
  finding out into Days 1–7.
- The ending should hand off to Week 2. Whatever happened with the chains is
  the first thing people talk about when the substation story breaks.

### 2. Substation altercation · Day 9

Canon: at the substation there was an altercation between Blocc Boys and
Angels members. People say guns were out, but nobody was shot. The word is
that Quanny pulled a gun on the Angels to scare them. It sets off the events
that follow.

- **Day 8: rumor first.** Word on the street before any scene, through the
  activity feed and NPC talk. Different people tell it differently. Some
  versions are wrong (who did what, whether shots were fired).
- **Day 9: the scene.** The player is pulled in by being nearby, by someone
  they know, or by being asked about it. They shouldn't have to tap a story
  button to start it. The player doesn't need to be at the substation; the
  story finds them.
- **The map remembers:** police tape and a parked squad car at the substation
  for a few days, more police in that neighborhood, and Angels and Blocc Boys
  members keeping their distance from each other.
- Quanny and Baby Canon's rivalry is the human center of this beat.

### 3. Fallout · Days 10–20

This is the stretch where the old grind comes back if nothing happens. Fill it
with consequences of the substation, not new storylines:

- **Rising tension:** Angels and Blocc Boys members avoid each other's turf,
  and there are more police around the substation.
- **Quanny and Baby Canon:** each one's name comes up around town, and they're
  seen where the other hangs out.
- **Picking a side:** the player's relationships and turf make them a target
  for questions like "where do you stand?"
- **Small witnessed moments** the player can watch, walk past or step into,
  such as a stare-down at the court or a car rolling slowly past.

Keep these small and short. They exist so the city feels like it's moving
toward something.

### 4. The studio with Cuzzo · Day 21 (confirm)

Canon: Cuzzo invites the player to the studio. He talks about making it out
of Southside and bringing the player with him when he does.

- This is the quiet heart of the season and the first real "way out." Keep it
  personal, not a mechanic. No stat menus in his dialogue.
- Mark it on the map: Cuzzo's car outside the studio, and Cuzzo at the studio
  at night from then on.
- What the player says here should come back up in beat 5.

### 5. Flacco's push · Days 22–28

Canon: Flacco says it's time to join a hood or build up the Set. Things are
heating up in the Stixx and they can't be small players.

- This should pull directly against beat 4: Cuzzo's way out versus Flacco's
  way up. The player shouldn't be able to fully satisfy both.
- It sets up the end of Season 1. That ending isn't written yet; ask the user.

## Rules for every beat

1. **Windows, not dates.** Each beat has an earliest day, a latest day and
   conditions that bring it sooner, such as where the player is or who they
   know. Beats must not land on day 7, 14, 21 boundaries in a way that feels
   like a timer.
2. **The city moves without the player.** If the player ignores a beat, it
   still happens and the world reacts.
3. **Rumor, then scene.** Things reach the player as street talk before they
   reach them as a choice.
4. **Leave a mark on the map** for every beat: something visible on the board
   that wasn't there before. Claude builds the board side, so tell Claude what
   the mark is.
5. **Characters talk like people.** Follow the voice and presentation rules
   from PR #29: no mechanics in dialogue, no internal terms on screen.
6. **A decision, not a chore.** If a story step never involves a choice, make
   it happen automatically instead of adding a button.

## Who builds what

- **Codex:** beat timing and triggers, the restructured Chains, rumor and
  feed content, encounter dialogue, and the consequences that carry from one
  beat to the next.
- **Claude:** map marks (tape, cars, characters placed at story spots),
  scene presentation, portraits, and review and merge of Codex's PRs.
- **Order:** beat 1 restructure → beat 2 → fallout content → beats 4 and 5.
  Ship each as its own PR.
