import { formatSimClock, type LivingBlockSim } from "./engine";

export interface DevInspectorHandle {
  update(): void;
  setSelectedNpc(npcId: string | null): void;
  destroy(): void;
}

/**
 * Developer inspector module.
 * Loaded dynamically ONLY when `?dev` is present in the URL query string so it
 * never ships in the normal production bundle, and positioned inside the safe
 * middle viewport area (never under top HUD or bottom nav).
 */
export function mountDevInspector(
  container: HTMLElement,
  sim: LivingBlockSim,
  onSelectNpc: (npcId: string) => void,
): DevInspectorHandle {
  let selectedNpcId: string | null = sim.getNpcs()[0]?.id ?? null;

  const panel = document.createElement("aside");
  panel.className = "sim-dev-inspector";
  panel.setAttribute("data-testid", "sim-dev-inspector");
  panel.innerHTML = `
    <div class="inspector-header">
      <strong>Dev Inspector (?dev)</strong>
      <span class="inspector-perf" data-testid="inspector-perf"></span>
    </div>
    <div class="inspector-npc-detail" data-testid="inspector-npc-detail"></div>
    <div class="inspector-presence" data-testid="inspector-presence"></div>
    <div class="inspector-log">
      <div class="inspector-subhead">Recent Decisions</div>
      <ul class="inspector-log-list" data-testid="inspector-log-list"></ul>
    </div>
  `;
  container.appendChild(panel);

  const perfEl = panel.querySelector<HTMLElement>(".inspector-perf")!;
  const detailEl = panel.querySelector<HTMLElement>(".inspector-npc-detail")!;
  const presenceEl = panel.querySelector<HTMLElement>(".inspector-presence")!;
  const logEl = panel.querySelector<HTMLUListElement>(".inspector-log-list")!;

  let lastSignature = "";

  const update = () => {
    const snap = sim.getInspectorSnapshot();
    const npc =
      snap.npcs.find((n) => n.id === selectedNpcId) ?? snap.npcs[0] ?? null;
    if (npc && !selectedNpcId) selectedNpcId = npc.id;

    const lilJaysHere = sim.peopleHere("reservoir.lil-jays");
    const sig = [
      snap.clock.tickCount,
      selectedNpcId,
      snap.cameraInArea,
      snap.paused,
      snap.speedMultiplier,
      snap.recentDecisions.length,
      lilJaysHere.map((p) => p.characterId).join(","),
    ].join("|");

    if (sig === lastSignature) return;
    lastSignature = sig;

    perfEl.textContent = `${snap.perf.mode} · avg ${snap.perf.avgStepMs.toFixed(3)}ms (max ${snap.perf.maxStepMs.toFixed(3)}ms)`;

    if (npc) {
      const remainingPath = npc.path.slice(npc.pathIndex).join(" -> ") || "(at destination)";
      const interrupted = npc.interruptedGoal
        ? `${npc.interruptedGoal.activity} (${npc.interruptedGoal.destinationLabel})`
        : "none";
      detailEl.innerHTML = `
        <div class="inspector-row">
          <strong>${npc.displayName}</strong>
          <span class="badge ${npc.isCanonical ? "badge-canon" : "badge-test"}">
            ${npc.isCanonical ? "Canonical" : "Test Resident"}
          </span>
          ${npc.affiliation ? `<span class="badge badge-faction">${npc.affiliation}</span>` : ""}
        </div>
        <div class="inspector-kv"><span>ID:</span><code>${npc.id}</code></div>
        <div class="inspector-kv"><span>Activity:</span><span>${npc.goal.activity} (${npc.locomotion})</span></div>
        <div class="inspector-kv"><span>Destination:</span><span>${npc.goal.destinationLabel} [<code>${npc.goal.destinationId}</code>]</span></div>
        <div class="inspector-kv"><span>Reason:</span><span>${npc.goal.reason}</span></div>
        <div class="inspector-kv"><span>Interrupted:</span><span>${interrupted}</span></div>
        <div class="inspector-kv"><span>Coords:</span><code>(${npc.x.toFixed(1)}, ${npc.z.toFixed(1)})</code></div>
        <div class="inspector-kv"><span>Path:</span><code class="path-code">${remainingPath}</code></div>
      `;
    }

    presenceEl.innerHTML = `
      <div class="inspector-subhead">peopleHere("reservoir.lil-jays")</div>
      <div class="inspector-presence-list">
        ${
          lilJaysHere.length > 0
            ? lilJaysHere
                .map(
                  (p) =>
                    `<button type="button" class="presence-chip" data-npc-id="${p.characterId}">${p.displayName} (${p.activity})</button>`,
                )
                .join("")
            : `<span class="muted">No NPCs currently anchored at Lil Jay's</span>`
        }
      </div>
    `;

    presenceEl.querySelectorAll<HTMLButtonElement>("[data-npc-id]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.npcId;
        if (id) {
          selectedNpcId = id;
          onSelectNpc(id);
          lastSignature = "";
          update();
        }
      };
    });

    const recent = snap.recentDecisions.slice(-8).reverse();
    logEl.innerHTML = recent
      .map(
        (entry) =>
          `<li><span class="log-time">D${entry.day} ${formatSimClock(entry.minuteOfDay)}</span> <strong>${entry.npcId}</strong>: ${entry.detail}</li>`,
      )
      .join("");
  };

  update();

  return {
    update,
    setSelectedNpc(npcId) {
      selectedNpcId = npcId;
      lastSignature = "";
      update();
    },
    destroy() {
      panel.remove();
    },
  };
}
