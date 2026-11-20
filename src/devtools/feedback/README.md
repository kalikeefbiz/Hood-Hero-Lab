# Dev feedback (Lab only)

A note button for playtesting. Tap it (or press **N** on a keyboard) to pause
the game and send a note with tags, a screenshot of the city and the game's
context (day, AP, cash, where you are, what's on screen, recent errors, build).

It only exists in builds made with `VITE_DEV_FEEDBACK=1`, which only the Lab
deploy sets. Other builds don't contain this code at all.

## Where notes go

- **With a token on the device:** straight to a GitHub issue in
  Hood-Hero-Lab, labelled `feedback` plus one `fb:<tag>` label per tag. The
  screenshot is stored on the `feedback-shots` branch.
- **Without a token:** opens a prefilled "new issue" page; tap Submit there.
  No screenshot in that case.

Status: open issue = open, `in progress` label = being worked on, closed =
resolved (closing comment explains the fix).

## Removing it

1. Delete `src/devtools/feedback/`.
2. Remove the `VITE_DEV_FEEDBACK` block in `src/main.tsx`.
3. Remove `VITE_DEV_FEEDBACK: "1"` from `.github/workflows/deploy-lab.yml`.

Optional: `BoardRenderer.capture()` and the `hh:pause` / `hh:resume`
listener in `StreetSession.tsx` are small, generic, and harmless to keep.
