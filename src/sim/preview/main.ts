import { AvatarAdapter, type AvatarPose } from "../../render/AvatarAdapter";
import { DOORS, FENCES, HOUSES, WALLS } from "../../strip/cityMap";
import { formatSimClock, LivingBlockSim } from "../engine";
import type { DevInspectorHandle } from "../inspector";

const SPEEDS = [1, 4, 15, 60] as const;

const canvas = document.getElementById("sim-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const clockEl = document.getElementById("sim-clock")!;
const statusEl = document.getElementById("sim-status")!;
const npcStripEl = document.getElementById("npc-strip")!;
const inspectorSlotEl = document.getElementById("inspector-slot")!;
const offviewBannerEl = document.getElementById("offview-banner")!;
const offviewSummaryEl = document.getElementById("offview-summary")!;

const btnPause = document.getElementById("btn-pause") as HTMLButtonElement;
const btnSpeed = document.getElementById("btn-speed") as HTMLButtonElement;
const btnArea = document.getElementById("btn-area") as HTMLButtonElement;
const btnReturnBanner = document.getElementById("btn-return-banner") as HTMLButtonElement;
const btnDisturbance = document.getElementById("btn-disturbance") as HTMLButtonElement;
const btnView = document.getElementById("btn-view") as HTMLButtonElement;
const btnNav = document.getElementById("btn-nav") as HTMLButtonElement;
const btnInspector = document.getElementById("btn-inspector") as HTMLButtonElement;
const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;

const params = new URLSearchParams(window.location.search);
const devMode = params.has("dev");
const initialSeed = Number(params.get("seed") ?? "20261122") || 20261122;

let sim = new LivingBlockSim({
  seed: initialSeed,
  engineDay: 1,
  startMinuteOfDay: 485, // 08:05 — morning movement across Lil Bit Lane
  simMinutesPerSecond: 1.0,
});
const adapter = new AvatarAdapter();

let speedIdx = 1; // Default 4x so movement & routines are immediately lively on open
sim.setSpeedMultiplier(SPEEDS[speedIdx]!);

let selectedNpcId: string | null = sim.getNpcs()[0]?.id ?? null;
let showNavGraph = true;
let viewMode: "lilbit" | "reservoir" = "lilbit";
let inspector: DevInspectorHandle | null = null;
let lastFrameTime = performance.now();
let lastHudMinute = -1;
let lastHudStatus = "";

// Expose debug handle for automated Playwright verification.
(window as unknown as Record<string, unknown>).__livingBlock = {
  getSim: () => sim,
  getPoses: () => adapter.sync(sim, sim.getInterpolationAlpha()),
  getSnapshot: () => sim.getInspectorSnapshot(),
  peopleHere: (id: string) => sim.peopleHere(id),
};

function getViewportBounds() {
  if (viewMode === "lilbit") {
    return { x0: -35, x1: 26, z0: -18, z1: 34 };
  }
  return { x0: -76, x1: 28, z0: -112, z1: 106 };
}

function worldToCanvas(wx: number, wz: number, width: number, height: number) {
  const b = getViewportBounds();
  const pad = 16;
  const worldW = b.x1 - b.x0;
  const worldH = b.z1 - b.z0;
  const scale = Math.min((width - pad * 2) / worldW, (height - pad * 2) / worldH);
  const offsetX = (width - worldW * scale) / 2 - b.x0 * scale;
  const offsetY = (height - worldH * scale) / 2 - b.z0 * scale;
  return {
    sx: wx * scale + offsetX,
    sy: wz * scale + offsetY,
    scale,
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function renderNpcStrip() {
  const npcs = sim.getNpcs();
  npcStripEl.innerHTML = npcs
    .map((n) => {
      const profile = sim.profiles.get(n.id);
      const active = n.id === selectedNpcId ? "active" : "";
      return `
        <button type="button" class="npc-chip ${active}" data-npc="${n.id}" data-testid="npc-chip-${n.id}">
          <span class="npc-chip-name">
            <span class="npc-dot" style="background:${profile?.accentColor ?? "#94a3b8"}"></span>
            ${n.displayName}
          </span>
          <span class="npc-chip-sub">${n.goal.activity} · ${n.locomotion}</span>
        </button>
      `;
    })
    .join("");

  npcStripEl.querySelectorAll<HTMLButtonElement>("[data-npc]").forEach((btn) => {
    btn.onclick = () => {
      selectedNpcId = btn.dataset.npc ?? null;
      inspector?.setSelectedNpc(selectedNpcId);
      renderNpcStrip();
    };
  });
}

function updateHud() {
  const clock = sim.getClock();
  const perf = sim.getPerformanceStats();
  const minuteInt = Math.floor(clock.minuteOfDay);
  if (minuteInt !== lastHudMinute) {
    lastHudMinute = minuteInt;
    clockEl.textContent = `Day ${clock.engineDay} · ${formatSimClock(clock.minuteOfDay)}`;
  }

  const modeLabel = sim.isCameraInArea() ? "20 Hz Active" : "1 Hz Off-View";
  const pauseLabel = sim.isPaused() ? "Paused" : `${sim.getSpeedMultiplier()}×`;
  const nextStatus = `${modeLabel} · ${pauseLabel} · ${perf.avgStepMs.toFixed(2)}ms`;
  if (nextStatus !== lastHudStatus) {
    lastHudStatus = nextStatus;
    statusEl.textContent = nextStatus;
  }

  if (!sim.isCameraInArea()) {
    const activeSummary = sim
      .getNpcs()
      .map((n) => `${n.displayName}: ${n.goal.activity} (${n.goal.destinationLabel})`)
      .join(" • ");
    offviewSummaryEl.textContent = activeSummary;
  }
}

function drawScene(poses: readonly AvatarPose[]) {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0e131b";
  ctx.fillRect(0, 0, w, h);

  const proj = (x: number, z: number) => worldToCanvas(x, z, w, h);
  const { scale } = proj(0, 0);

  // 1. Road strips (derived visually from Lil Bit Lane & Kirkwood bands).
  const roads = [
    { x0: -36, x1: 24, z0: 3.0, z1: 12.6, label: "LIL BIT LANE" },
    { x0: 6.6, x1: 14.0, z0: -108, z1: 104, label: "KIRKWOOD ST" },
    { x0: -32, x1: 14, z0: 48.0, z1: 57.4, label: "BLOCC BOY BLVD" },
    { x0: -48, x1: 14, z0: 92.0, z1: 101.4, label: "NO REFUND RD" },
    { x0: -72, x1: 14, z0: -40.6, z1: -31.2, label: "BIG MOUTH BLVD" },
    { x0: -52, x1: 14, z0: -92.0, z1: -82.6, label: "DIRTY MONEY DR" },
  ];
  ctx.fillStyle = "#192130";
  for (const r of roads) {
    const a = proj(r.x0, r.z0);
    const b = proj(r.x1, r.z1);
    ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
  }

  // Street labels
  ctx.fillStyle = "rgba(148, 163, 184, 0.45)";
  ctx.font = "600 10px sans-serif";
  ctx.textAlign = "center";
  const lbl = proj(-12, 7.8);
  ctx.fillText("LIL BIT LANE", lbl.sx, lbl.sy + 3);

  // 2. Navigation graph overlay (sidewalks, crosswalks, doors).
  if (showNavGraph) {
    for (const edge of sim.navMap.edges) {
      const aNode = sim.navIndex.nodeById.get(edge.from);
      const bNode = sim.navIndex.nodeById.get(edge.to);
      if (!aNode || !bNode) continue;
      const a = proj(aNode.x, aNode.z);
      const b = proj(bNode.x, bNode.z);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.strokeStyle =
        edge.kind === "crosswalk"
          ? "rgba(250, 204, 21, 0.55)"
          : edge.kind === "approach"
            ? "rgba(56, 189, 248, 0.35)"
            : "rgba(148, 163, 184, 0.35)";
      ctx.setLineDash(edge.kind === "crosswalk" ? [4, 4] : []);
      ctx.lineWidth = edge.kind === "crosswalk" ? 2 : 1.5;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // 3. Solid building footprints (WALLS from cityMap.ts).
  for (const wall of WALLS) {
    const a = proj(wall.x0, wall.z0);
    const b = proj(wall.x1, wall.z1);
    ctx.fillStyle = wall.id === "lil-jays" ? "#26364f" : "#1d2636";
    ctx.strokeStyle = wall.id === "lil-jays" ? "#60a5fa" : "#3b4c68";
    ctx.lineWidth = 1.2;
    ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
    ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
  }

  // 4. Chain-link fences (FENCES from cityMap.ts).
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth = 2;
  for (const fence of FENCES) {
    const a = proj(fence.ax, fence.az);
    const b = proj(fence.bx, fence.bz);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }

  // 5. Door & Home anchors.
  ctx.textAlign = "center";
  ctx.font = "600 9px sans-serif";
  for (const door of DOORS) {
    const p = proj(door.x, door.z);
    ctx.fillStyle = "#34d399";
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (viewMode === "lilbit" || door.locationId === "reservoir.lil-jays" || door.locationId === "reservoir.pawn") {
      ctx.fillStyle = "#a7f3d0";
      ctx.fillText(door.label.replace("Reservoir ", ""), p.sx, p.sy - 7);
    }
  }
  for (const house of HOUSES) {
    if (viewMode === "lilbit" && house.street !== "Lil Bit Lane") continue;
    const p = proj(house.x, house.z);
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(203, 213, 225, 0.7)";
    ctx.fillText(house.id.replace("res-", ""), p.sx, p.sy - 5);
  }

  // 6. Active disturbances.
  const snap = sim.getInspectorSnapshot();
  for (const d of snap.disturbances) {
    const p = proj(d.x, d.z);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, d.radius * scale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239, 68, 68, 0.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(239, 68, 68, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#fca5a5";
    ctx.fillText(d.label, p.sx, p.sy - 6);
  }

  // 7. Active NPC planned paths.
  for (const npc of sim.getNpcs()) {
    if (npc.pathIndex >= npc.path.length) continue;
    const isSel = npc.id === selectedNpcId;
    const profile = sim.profiles.get(npc.id);
    ctx.beginPath();
    const startP = proj(npc.x, npc.z);
    ctx.moveTo(startP.sx, startP.sy);
    for (let i = npc.pathIndex; i < npc.path.length; i++) {
      const node = sim.navIndex.nodeById.get(npc.path[i]!);
      if (!node) continue;
      const np = proj(node.x, node.z);
      ctx.lineTo(np.sx, np.sy);
    }
    ctx.strokeStyle = isSel
      ? profile?.accentColor ?? "#f59e0b"
      : "rgba(226, 232, 240, 0.25)";
    ctx.lineWidth = isSel ? 2.4 : 1.2;
    ctx.stroke();
  }

  // 8. Five autonomous NPCs rendered strictly via AvatarAdapter poses.
  for (const pose of poses) {
    const p = proj(pose.x, pose.z);
    const isSel = pose.id === selectedNpcId;
    const r = isSel ? 7.5 : 6;

    // Facing cone
    const fx = Math.sin(pose.facing);
    const fz = Math.cos(pose.facing);
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy);
    ctx.lineTo(p.sx + fx * (r + 7), p.sy + fz * (r + 7));
    ctx.strokeStyle = pose.accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Locomotion ring for active walking / running / chatting
    if (pose.locomotion === "walk" || pose.locomotion === "run" || pose.activity === "social_chat") {
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle =
        pose.activity === "social_chat"
          ? "#34d399"
          : pose.locomotion === "run"
            ? "#ef4444"
            : "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Avatar body
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fillStyle = pose.accentColor;
    ctx.fill();
    ctx.strokeStyle = isSel ? "#ffffff" : "#0b0e14";
    ctx.lineWidth = isSel ? 2 : 1.5;
    ctx.stroke();

    // Nameplate
    ctx.fillStyle = "#f8fafc";
    ctx.font = isSel ? "700 11px sans-serif" : "600 10px sans-serif";
    ctx.fillText(pose.displayName, p.sx, p.sy - r - 6);
  }
}

async function toggleInspector(forceOpen?: boolean) {
  const shouldOpen = forceOpen ?? inspector === null;
  if (!shouldOpen && inspector) {
    inspector.destroy();
    inspector = null;
    btnInspector.classList.remove("active");
    return;
  }
  if (shouldOpen && !inspector) {
    // Dynamic import keeps inspector code out of non-dev bundles.
    const mod = await import("../inspector");
    inspector = mod.mountDevInspector(inspectorSlotEl, sim, (id) => {
      selectedNpcId = id;
      renderNpcStrip();
    });
    inspector.setSelectedNpc(selectedNpcId);
    btnInspector.classList.add("active");
  }
}

function setAreaVisible(inArea: boolean) {
  sim.setCameraInArea(inArea);
  offviewBannerEl.classList.toggle("hidden", inArea);
  btnArea.textContent = inArea ? "Leave Block" : "Return Block";
  btnArea.classList.toggle("active", !inArea);
}

// --- Controls ---
btnPause.onclick = () => {
  sim.setPaused(!sim.isPaused());
  btnPause.textContent = sim.isPaused() ? "Resume" : "Pause";
  btnPause.classList.toggle("active", sim.isPaused());
};

btnSpeed.onclick = () => {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  const next = SPEEDS[speedIdx]!;
  sim.setSpeedMultiplier(next);
  btnSpeed.textContent = `Speed ${next}×`;
};

btnArea.onclick = () => setAreaVisible(!sim.isCameraInArea());
btnReturnBanner.onclick = () => setAreaVisible(true);

btnDisturbance.onclick = () => {
  sim.triggerDisturbance({
    kind: "commotion",
    x: -6.0,
    z: 2.2,
    radius: 9.0,
    remainingSec: 8.0,
    label: "Argument on Lil Bit Lane",
  });
};

btnView.onclick = () => {
  viewMode = viewMode === "lilbit" ? "reservoir" : "lilbit";
  btnView.textContent = viewMode === "lilbit" ? "View: Lil Bit" : "View: Reservoir";
};

btnNav.onclick = () => {
  showNavGraph = !showNavGraph;
  btnNav.classList.toggle("active", showNavGraph);
};

btnInspector.onclick = () => {
  void toggleInspector();
};

btnReset.onclick = () => {
  sim = new LivingBlockSim({
    seed: initialSeed,
    engineDay: 1,
    startMinuteOfDay: 485,
    simMinutesPerSecond: 1.0,
    cameraInArea: true,
  });
  sim.setSpeedMultiplier(SPEEDS[speedIdx]!);
  setAreaVisible(true);
  renderNpcStrip();
  if (inspector) {
    inspector.destroy();
    inspector = null;
    void toggleInspector(true);
  }
};

canvas.addEventListener("pointerdown", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const cx = ev.clientX - rect.left;
  const cy = ev.clientY - rect.top;
  const poses = adapter.sync(sim, sim.getInterpolationAlpha());
  let bestId: string | null = null;
  let bestDist = 28;
  for (const pose of poses) {
    const p = worldToCanvas(pose.x, pose.z, rect.width, rect.height);
    const d = Math.hypot(p.sx - cx, p.sy - cy);
    if (d < bestDist) {
      bestDist = d;
      bestId = pose.id;
    }
  }
  if (bestId) {
    selectedNpcId = bestId;
    inspector?.setSelectedNpc(bestId);
    renderNpcStrip();
  }
});

let stripRefreshTick = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  const alpha = sim.update(dt);
  const poses = adapter.sync(sim, alpha);

  if (sim.isCameraInArea()) {
    drawScene(poses);
  }
  updateHud();
  inspector?.update();

  stripRefreshTick++;
  if (stripRefreshTick % 12 === 0) {
    renderNpcStrip();
  }

  requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);
if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
  new ResizeObserver(() => resizeCanvas()).observe(canvas.parentElement);
}
resizeCanvas();
btnSpeed.textContent = `Speed ${SPEEDS[speedIdx]}×`;
renderNpcStrip();
if (devMode) {
  void toggleInspector(true);
}
requestAnimationFrame(loop);
