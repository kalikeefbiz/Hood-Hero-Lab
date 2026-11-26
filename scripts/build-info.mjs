import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { GAME_SAVE_VERSION } from "../src/core/GameState.ts";
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
writeFileSync(
  "dist/build-info.json",
  JSON.stringify({
    app: "Hood Hero",
    commit,
    saveSchema: GAME_SAVE_VERSION,
    milestone: "GOAL 011",
  }) + "\n",
);
