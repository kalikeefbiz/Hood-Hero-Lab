import { newGame as freshGame } from "../core/Simulation";
import { newStreetLife } from "../systems/StreetLifeState";

/** Existing-system probes bypass the onboarding gates while retaining the Chains incident. */
export const newGame: typeof freshGame = (...args) => {
  const s = freshGame(...args);
  s.streetLife = newStreetLife(true);
  return s;
};

export { enterGameplay } from "../core/Simulation";
