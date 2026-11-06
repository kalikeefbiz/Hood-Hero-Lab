import { newGame as freshGame } from "../core/Simulation";
import { deserialize, serialize } from "../persistence/SaveSystem";
/** Existing-system probes run against a real migrated pre-GOAL011 save.
 * Fresh onboarding and its physical gates are exercised in streetLife.test.ts.
 * This preserves the old AP/wallet/incident preconditions without faking tutorial rewards. */
export const newGame: typeof freshGame = (...args) => {
  const s = freshGame(...args);
  s.version = 9;
  delete s.streetLife;
  // v9 did not contain the new ordinary Rio contact.
  delete s.characters["contact-angels"];
  for (const c of Object.values(s.characters)) {
    c.known = c.known.filter((id) => id !== "contact-angels");
    c.connections = c.connections.filter((id) => id !== "contact-angels");
    delete c.relationships["contact-angels"];
  }
  return deserialize(serialize(s));
};

export { enterGameplay } from "../core/Simulation";
