import { LivingBlockSim, type LivingBlockSimOptions } from "./engine";
import { SIM_SNAPSHOT_VERSION, type SimSnapshotV1 } from "./types";

/**
 * Persistence contract for Codex's `SaveSystem.ts` integration.
 * The sim does NOT create a separate authoritative save file or rename the save slot.
 * Codex attaches `sim?: SimSnapshotV1` to the existing GameState / save envelope and calls
 * `extractSimSnapshot` / `restoreSimFromSave`.
 */
export interface SaveEnvelopeWithOptionalSim {
  day?: number;
  sim?: unknown;
}

export function isValidSimSnapshotV1(value: unknown): value is SimSnapshotV1 {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<SimSnapshotV1>;
  return (
    v.schemaVersion === SIM_SNAPSHOT_VERSION &&
    typeof v.seed === "number" &&
    typeof v.rngState === "number" &&
    typeof v.clock === "object" &&
    v.clock !== null &&
    typeof v.clock.engineDay === "number" &&
    typeof v.clock.minuteOfDay === "number" &&
    Array.isArray(v.npcs)
  );
}

/**
 * Extracts a versioned snapshot suitable for storing inside the existing Lab save slot.
 */
export function extractSimSnapshot(sim: LivingBlockSim): SimSnapshotV1 {
  return sim.serialize();
}

/**
 * Restores a `LivingBlockSim` from an existing save object.
 * - Backward compatible: legacy saves without `save.sim` (or with malformed/old sim data)
 *   cleanly boot a fresh deterministic simulation synced to `save.day`.
 */
export function restoreSimFromSave(
  save: SaveEnvelopeWithOptionalSim | null | undefined,
  options: LivingBlockSimOptions = {},
): { sim: LivingBlockSim; restoredFromSnapshot: boolean } {
  const engineDay = options.engineDay ?? save?.day ?? 1;
  if (save && isValidSimSnapshotV1(save.sim)) {
    return {
      sim: LivingBlockSim.fromSnapshot(save.sim, { ...options, engineDay }),
      restoredFromSnapshot: true,
    };
  }
  return {
    sim: new LivingBlockSim({ ...options, engineDay }),
    restoredFromSnapshot: false,
  };
}
