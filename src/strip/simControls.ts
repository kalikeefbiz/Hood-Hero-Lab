// Preview controls for the NPC simulation: a clock chip, time speed, a commotion where you
// stand (the simulation's own disturbance event), and who is where. Display and dev levers
// only: every NPC decision stays in Gemini's LivingBlockSim. With ?dev, Gemini's own
// inspector is mounted as well.
import { formatSimClock, type LivingBlockSim } from "../sim";

const SPEEDS = [1, 10, 60];

export function mountSimControls(sim: LivingBlockSim, where: () => { x: number; z: number }) {
  const chip = document.createElement("button");
  chip.id = "simclock";
  chip.type = "button";
  chip.setAttribute("aria-label", "Neighborhood time and people");
  document.querySelector(".hud")!.prepend(chip);

  const sheet = document.createElement("section");
  sheet.className = "simsheet";
  sheet.hidden = true;
  sheet.innerHTML = `<header><div class="titles"><h2>The block right now</h2><small>NPC simulation · preview controls</small></div></header>
    <div class="row speeds"></div>
    <button type="button" class="pick commotion">Cause a commotion here</button>
    <h3>People</h3><div class="who"></div>`;
  const close = document.createElement("button");
  close.className = "close"; close.type = "button"; close.textContent = "✕"; close.setAttribute("aria-label", "Close");
  close.onclick = () => { sheet.hidden = true; };
  sheet.querySelector("header")!.append(close);
  const speeds = sheet.querySelector<HTMLElement>(".speeds")!;
  for (const s of SPEEDS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ghost"; b.dataset.speed = String(s); b.textContent = `${s}×`;
    b.onclick = () => { sim.setSpeedMultiplier(s); paint(); };
    speeds.append(b);
  }
  sheet.querySelector<HTMLButtonElement>(".commotion")!.onclick = () => {
    const p = where();
    sim.triggerDisturbance({ kind: "commotion", x: p.x, z: p.z, radius: 14, remainingSec: 25, label: "Commotion on the block" });
    sheet.hidden = true;
  };
  document.body.append(sheet);
  chip.onclick = () => { sheet.hidden = !sheet.hidden; paint(); };

  const who = sheet.querySelector<HTMLElement>(".who")!;
  const label: Record<string, string> = {
    home_rest: "at home", shop_errand: "shopping", work_shift: "working", post_up: "posted up",
    visit_neighbor: "visiting", stroll: "out walking", social_chat: "talking", yield_wait: "stepping aside",
    react_disturbance: "reacting to a commotion", recover_route: "finding another way",
  };
  function paint() {
    for (const b of speeds.querySelectorAll<HTMLButtonElement>("button")) b.classList.toggle("on", Number(b.dataset.speed) === sim.getSpeedMultiplier());
    if (sheet.hidden) return;
    who.replaceChildren(...sim.getNpcs().map((n) => {
      const p = document.createElement("p");
      p.className = "npcrow";
      p.dataset.npc = n.id;
      const where = n.atDestinationId ? `at ${n.goal.destinationLabel}` : `→ ${n.goal.destinationLabel}`;
      p.textContent = `${n.displayName}${n.isCanonical ? "" : " (test)"} · ${label[n.goal.activity] ?? n.goal.activity} · ${where}`;
      return p;
    }));
  }
  let t = 0;
  function update(dt: number) {
    t += dt;
    if (t < 0.5) return;
    t = 0;
    const speed = sim.getSpeedMultiplier();
    chip.textContent = `${formatSimClock(sim.getClock().minuteOfDay)}${speed > 1 ? ` · ${speed}×` : ""}`;
    paint();
  }
  update(1);

  if (new URLSearchParams(location.search).has("dev") || location.hash === "#dev") {
    void import("../sim/inspector").then(({ mountDevInspector }) => {
      const host = document.createElement("div");
      host.className = "sim-inspector-host";
      document.body.append(host);
      const h = mountDevInspector(host, sim, () => {});
      setInterval(() => h.update(), 500);
    });
  }
  return { update };
}
