// Draws the Reservoir gameplay map (top-down, north up) from src/strip/cityMap.ts.
// Usage: node art/reservoir/scripts/map_svg.mjs   -> docs/maps/reservoir-map.svg + .png
// Needs: esbuild (repo devDependency) and sharp (run from a folder where `sharp` resolves).
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const out = "/tmp/cityMap.mjs";
await build({ entryPoints: ["src/strip/cityMap.ts"], outfile: out, format: "esm", bundle: true, logLevel: "error" });
const M = await import(pathToFileURL(out).href + "?t=" + Date.now());

const K = 8; // px per metre
const X0 = -82, X1 = 26, Z0 = -114, Z1 = 114;
const X = (x) => +((x - X0) * K).toFixed(1);
const Y = (z) => +((z - Z0) * K).toFixed(1);
const W = (X1 - X0) * K, H = (Z1 - Z0) * K;
const streets = [
  ["Dirty Money Dr", -92, -82.6], ["Big Mouth Blvd", -40.6, -31.2], ["Lil Bit Lane", 3, 12.6],
  ["Blocc Boy Blvd", 48, 57.4], ["No Refund Road", 92, 101.4],
];
const kirk = [6.6, 14, -92, 101.4];
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif">`;
s += `<rect width="${W}" height="${H}" fill="#1b1d1f"/>`;
// metre grid every 20 m
for (let x = Math.ceil(X0 / 20) * 20; x <= X1; x += 20) s += `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}" stroke="#2c2f32"/><text x="${X(x)}" y="14" fill="#6b7075" font-size="12" text-anchor="middle">x ${x}</text>`;
for (let z = Math.ceil(Z0 / 20) * 20; z <= Z1; z += 20) s += `<line x1="0" y1="${Y(z)}" x2="${W}" y2="${Y(z)}" stroke="#2c2f32"/><text x="4" y="${Y(z) - 3}" fill="#6b7075" font-size="12">z ${z}</text>`;
// walk bounds
const b = M.WALK_BOUNDS;
s += `<rect x="${X(b.x0)}" y="${Y(b.z0)}" width="${(b.x1 - b.x0) * K}" height="${(b.z1 - b.z0) * K}" fill="none" stroke="#8a8f94" stroke-dasharray="10 6"/>`;
// roads
for (const [n, a, c] of streets) {
  s += `<rect x="${X(X0 + 6)}" y="${Y(a)}" width="${(b.x1 - X0 - 6) * K}" height="${(c - a) * K}" fill="#3a3d40"/>`;
  s += `<text x="${X(-60)}" y="${Y((a + c) / 2) + 5}" fill="#b9bec3" font-size="16" font-weight="700">${esc(n.toUpperCase())}</text>`;
}
s += `<rect x="${X(kirk[0])}" y="${Y(kirk[2])}" width="${(kirk[1] - kirk[0]) * K}" height="${(kirk[3] - kirk[2]) * K}" fill="#3a3d40"/>`;
s += `<text transform="translate(${X(10.3)},${Y(60)}) rotate(90)" fill="#b9bec3" font-size="14" font-weight="700">KIRKWOOD ST</text>`;
// buildings
const home = new Set(M.HOUSES.map((h) => h.label));
for (const w of M.WALLS) s += `<rect x="${X(w.x0)}" y="${Y(w.z0)}" width="${((w.x1 - w.x0) * K).toFixed(1)}" height="${((w.z1 - w.z0) * K).toFixed(1)}" fill="#59626b" stroke="#222" />`;
for (const f of M.FENCES) s += `<line x1="${X(f.ax)}" y1="${Y(f.az)}" x2="${X(f.bx)}" y2="${Y(f.bz)}" stroke="#e59a3a" stroke-width="3" stroke-dasharray="6 3"/>`;
// homes
for (const h of M.HOUSES) {
  const job = h.targetId;
  const col = job ? "#f2c230" : "#4fc3f7";
  const dir = h.facing === 0 ? 1 : -1;
  s += `<circle cx="${X(h.x)}" cy="${Y(h.z)}" r="${(h.radius * K).toFixed(1)}" fill="${col}" fill-opacity="0.25" stroke="${col}" stroke-width="2"/>`;
  s += `<text x="${X(h.x)}" y="${Y(h.z) + 4}" fill="#fff" font-size="12" font-weight="700" text-anchor="middle">${h.id.slice(-2)}</text>`;
  if (job) s += `<text x="${X(h.x)}" y="${(Y(h.z) - 14 * dir).toFixed(1)}" fill="${col}" font-size="11" text-anchor="middle">${esc(job)}</text>`;
}
// storefronts
for (const d of M.STOREFRONTS) s += `<circle cx="${X(d.x)}" cy="${Y(d.z)}" r="${d.radius * K}" fill="#b28cff" fill-opacity="0.25" stroke="#b28cff" stroke-width="2"/><text x="${X(d.x)}" y="${Y(d.z) + 18}" fill="#d9c7ff" font-size="11" text-anchor="middle">${esc(d.label.replace("Reservoir ", ""))}</text>`;
// places (doors)
for (const d of M.DOORS) s += `<circle cx="${X(d.x)}" cy="${Y(d.z)}" r="${d.radius * K}" fill="#3ddc84" fill-opacity="0.3" stroke="#3ddc84" stroke-width="3"/><text x="${X(d.x)}" y="${Y(d.z) + (d.facing === 0 ? 26 : -22)}" transform="translate(${d.locationId==="reservoir.lil-jays"?-40:0},0)" fill="#a8f5c8" font-size="12" font-weight="700" text-anchor="middle">${esc(d.locationId.replace("reservoir.",""))}</text>`;
// npcs + spawn
for (const n of M.NPC_SPOTS) s += `<circle cx="${X(n.x)}" cy="${Y(n.z)}" r="7" fill="#ff5f5f"/><text x="${Number(X(n.x)) + 12}" y="${Y(n.z) + 4}" fill="#ffb0b0" font-size="12">${esc(n.characterId)}</text>`;
const p = M.PLAYER_START;
s += `<polygon points="${X(p.x)},${Y(p.z) - 9} ${Number(X(p.x)) + 8},${Number(Y(p.z)) + 7} ${Number(X(p.x)) - 8},${Number(Y(p.z)) + 7}" fill="#fff"/><text x="${Number(X(p.x)) + 12}" y="${Y(p.z) + 18}" fill="#fff" font-size="12">START</text>`;
// water tower note + legend
s += `<text x="${X(-80)}" y="${Y(-24)}" fill="#8a8f94" font-size="12">◀ west edge of the Reservoir / Stixx</text>`;
const lg = [["#3ddc84", "Place (locationId)"], ["#f2c230", "Home with a robbery target"], ["#4fc3f7", "Home, no job attached yet"], ["#b28cff", "Storefront (scenery)"], ["#59626b", "Building (solid)"], ["#e59a3a", "Fence (solid)"], ["#ff5f5f", "NPC"]];
lg.forEach(([c, t], i) => { s += `<rect x="24" y="${Y(-20) + i * 22}" width="14" height="14" fill="${c}"/><text x="44" y="${Y(-20) + 12 + i * 22}" fill="#ddd" font-size="13">${t}</text>`; });
s += `<text x="${W - 232}" y="${H - 14}" fill="#888" font-size="12">N ↑  · metres · 1 grid = 20 m</text></svg>`;

mkdirSync("docs/maps", { recursive: true });
writeFileSync("docs/maps/reservoir-map.svg", s);
const sharp = createRequire("/home/claude/gt/package.json")("sharp");
await sharp(Buffer.from(s)).png().toFile("docs/maps/reservoir-map.png");
console.log("ok", W, H);
