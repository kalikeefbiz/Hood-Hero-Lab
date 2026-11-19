import type { CommitmentStatus } from "../core/GameState";
export function propertyPromiseOutcome(status: CommitmentStatus) {
  const fulfilled = status === "fulfilled",
    broken = status === "broken";
  const title = fulfilled
    ? "You kept your word"
    : broken
      ? "You left Cuzzo hanging"
      : status === "released"
        ? "Cuzzo released your promise"
        : "The Chains — settled without you";
  const text =
    status === "released"
      ? "Cuzzo let you off the hook. No hard feelings."
      : fulfilled
        ? "You helped get Cuzzo’s chains back. He won’t forget that you kept your word."
        : broken
          ? "The chains are gone for good. You gave Cuzzo your word and didn’t come through, and he’s taking it hard."
          : "It got settled before you could do anything. Nobody holds it against you, but you can’t take credit either.";

  return {
    title,
    text,
    memory: fulfilled
      ? "Kept the promise to help recover my chains."
      : broken
        ? "Promised to help, then left me hanging."
        : status === "released"
          ? "Released the promise to help."
          : "The situation ended before the promise could be carried out.",
    weight: fulfilled ? 15 : broken ? -18 : 0,
  };
}
