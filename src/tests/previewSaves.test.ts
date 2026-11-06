import { afterEach, expect, test, vi } from "vitest";
import { newGame } from "./legacyGame";

// Main's preview suffix must isolate complete v9 campaigns without changing old Lab slots.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
test("preview manual/auto saves cannot read or overwrite the existing Lab campaign", async () => {
  const slots = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return slots.size;
    },
    clear: () => slots.clear(),
    getItem: (key) => slots.get(key) ?? null,
    key: (index) => [...slots.keys()][index] ?? null,
    removeItem: (key) => {
      slots.delete(key);
    },
    setItem: (key, value) => {
      slots.set(key, value);
    },
  };
  vi.stubEnv("VITE_SAVE_SUFFIX", "");
  vi.resetModules();
  const main = await import("../persistence/SaveSystem");
  const campaign = newGame("Main campaign", "south", 42);
  main.saveGame(storage, campaign);
  main.saveGame(storage, campaign, main.AUTO_KEY);
  const manual = storage.getItem("blackhouse.hoodhero-lab.v1");
  const automatic = storage.getItem("blackhouse.hoodhero-lab.v1.auto");
  expect(manual).not.toBeNull();
  expect(automatic).not.toBeNull();

  vi.stubEnv("VITE_SAVE_SUFFIX", ".next");
  vi.resetModules();
  const preview = await import("../persistence/SaveSystem");
  expect(preview.loadGame(storage)).toBeNull();
  expect(preview.loadGame(storage, preview.AUTO_KEY)).toBeNull();
  const other = newGame("Preview campaign", "nawf", 55);
  preview.saveGame(storage, other);
  preview.saveGame(storage, other, preview.AUTO_KEY);
  expect(preview.loadGame(storage)).toEqual(other);
  expect(preview.loadGame(storage, preview.AUTO_KEY)).toEqual(other);
  expect(storage.getItem("blackhouse.hoodhero-lab.v1")).toBe(manual);
  expect(storage.getItem("blackhouse.hoodhero-lab.v1.auto")).toBe(automatic);
  expect(main.loadGame(storage)).toEqual(campaign);
  expect(main.loadGame(storage, main.AUTO_KEY)).toEqual(campaign);
});
