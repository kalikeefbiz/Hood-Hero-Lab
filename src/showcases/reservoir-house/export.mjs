// Run against the Vite dev server to export the building independently of the lot.
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const [origin, output] = process.argv.slice(2);
if (!origin || !output) {
  throw new Error("Usage: node export.mjs <Vite server origin> <output.glb>");
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Export in a fresh document on the same origin, without a WebGL renderer.
  await page.route("**/house-export", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>House export</title>",
    }),
  );
  await page.goto(new URL("/house-export", origin).href);
  const base64 = await page.evaluate(async () => {
    const { createReservoirHouse, loadHouseTextures } =
      await import("/src/showcases/reservoir-house/house.ts");
    const { GLTFExporter } =
      await import("/node_modules/three/examples/jsm/exporters/GLTFExporter.js");
    const house = createReservoirHouse(await loadHouseTextures());
    house.root.userData = {
      collision: house.collision,
      entrances: house.entrances,
      units: "metres",
      forward: "+Z",
    };
    house.root.traverse((node) => {
      if (!node.isMesh) return;
      if (node.material.normalMap) node.geometry.computeTangents();
      if (!node.material.map) {
        node.geometry.deleteAttribute("uv");
        node.geometry.deleteAttribute("uv1");
      }
    });
    const buffer = await new GLTFExporter().parseAsync(house.root, {
      binary: true,
    });
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      chunks.push(
        String.fromCharCode(...bytes.subarray(offset, offset + 32768)),
      );
    }
    return btoa(chunks.join(""));
  });
  await writeFile(output, Buffer.from(base64, "base64"), { flag: "wx" });
} finally {
  await browser.close();
}
