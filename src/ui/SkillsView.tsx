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
                ? `Next: ${def.ranks[rank]} · ${(def.gates[rank] / 100).toFixed(2)} cumulative XP (${(Math.max(0, def.gates[rank] - progress.xp[id]) / 100).toFixed(2)} remaining)`
                : "Top rank reached."}
            </p>
            {missing.map((m) => (
              <p key={m}>Required: {publicRequirement(m)}</p>
            ))}
            {id === "trapper" && (
              <p>
                Current margin +${(rank - 1) * 2}/unit · up to{" "}
                {1 + Math.floor((rank - 1) / 2)} units per committed buyer,
                limited by stock and demand.
              </p>
            )}
            {id === "leadership" && (
              <p>
                Coordination improves Set outcome checks; faction authority
                remains independent.
              </p>
            )}
            <p className="muted">
              {id === "trapper"
                ? "Ranks improve margins, volume and future supply access. Buyer decisions depend on the block."
                : id === "combat" || id === "robbery"
                  ? "Learn about further opportunities by talking to trusted contacts."
                  : "Experience comes from completed, meaningful outcomes."}
            </p>
          </details>
        );
      })}
      {character.id === "player" && (
        <details>
          <summary>Recent XP records</summary>
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
