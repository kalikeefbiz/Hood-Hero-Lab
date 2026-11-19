import type { GameState } from "../core/GameState";
export function CommitmentSummary({ s }: { s: GameState }) {
  const promises = s.commitments.filter(
    (c) => c.kind === "recover-property" && c.status === "pending",
  );
  if (!promises.length) return null;
  return (
    <section className="commitment-summary panel" aria-label="Your promises">
      <h3>Your word</h3>
      {promises.map((c) => (
        <div key={c.id}>
          <strong>Help Cuzzo get his chains back</strong>
          <p>
            {c.status === "pending"
              ? `${Math.max(0, c.dueDay - s.day)} days left · until day ${c.dueDay}, unless things move on without you`
              : c.status === "fulfilled"
                ? "You came through, and Cuzzo knows it."
                : c.status === "broken"
                  ? "Cuzzo remembers the promise you broke."
                  : "It got settled before you could act. No harm done."}
          </p>
        </div>
      ))}
    </section>
  );
}
