import { publicRequirement } from "../presentation/PlayerInformation";
import type { Character } from "../core/GameState";
import {
  SKILLS,
  skillIds,
  skillsOf,
  skillRank,
  missingMilestones,
} from "../systems/Skills";
export function SkillsView({ character }: { character: Character }) {
  const progress = skillsOf(character);
  return (
    <section
      className="panel skills-view"
      aria-label={`${character.name} skills`}
    >
      <h3>Skills</h3>
      {skillIds.map((id) => {
        const def = SKILLS[id],
          rank = skillRank(character, id),
          missing = rank < 4 ? missingMilestones(character, id, rank + 1) : [];
        return (
          <details key={id} className="skill-track">
            <summary>
              <strong>
                {def.name} · {def.ranks[rank - 1]}
              </strong>
              <span>
                Rank {rank}/4 · {(progress.xp[id] / 100).toFixed(2)} XP
              </span>
            </summary>
            <p>{def.ranks.join(" → ")}</p>
            <p>
              {rank < 4
                ? `Next rank: ${def.ranks[rank]} · ${(Math.max(0, def.gates[rank] - progress.xp[id]) / 100).toFixed(2)} XP to go`
                : "Top rank reached."}
            </p>
            {missing.map((m) => (
              <p key={m}>Still need: {publicRequirement(m)}</p>
            ))}
            {id === "trapper" && (
              <p>
                You make an extra ${(rank - 1) * 2} on each sale, and a buyer
                may take up to {1 + Math.floor((rank - 1) / 2)} at once if you
                have the stock.
              </p>
            )}
            {id === "leadership" && (
              <p>
                Your Set does better when you lead it well. Your rank in an
                organization is a separate thing.
              </p>
            )}
            <p className="muted">
              {id === "trapper"
                ? "Moving up means better money, bigger sales and better suppliers. Whether someone buys still depends on the block."
                : id === "combat" || id === "robbery"
                  ? "People you trust can point you toward bigger opportunities."
                  : "You get better by doing things that matter."}
            </p>
          </details>
        );
      })}
      {character.id === "player" && (
        <details>
          <summary>Recent progress</summary>
          {progress.awards
            .slice(-16)
            .reverse()
            .map((a) => (
              <p key={a.id}>
                Day {a.day} · {SKILLS[a.skill].name} +
                {(a.amount / 100).toFixed(2)}
              </p>
            ))}
        </details>
      )}
    </section>
  );
}
