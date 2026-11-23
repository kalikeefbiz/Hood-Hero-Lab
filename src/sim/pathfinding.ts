import type { NavEdge, NavMap, NavNode } from "./types";

export interface NavGraphIndex {
  nodeById: Map<string, NavNode>;
  adjacency: Map<string, { to: string; edge: NavEdge }[]>;
}

export function buildNavGraphIndex(navMap: NavMap): NavGraphIndex {
  const nodeById = new Map<string, NavNode>();
  const adjacency = new Map<string, { to: string; edge: NavEdge }[]>();

  for (const node of navMap.nodes) {
    nodeById.set(node.id, node);
    adjacency.set(node.id, []);
  }

  for (const edge of navMap.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
    adjacency.get(edge.from)!.push({ to: edge.to, edge });
    if (edge.bidirectional !== false) {
      adjacency.get(edge.to)!.push({ to: edge.from, edge });
    }
  }

  // Deterministic neighbor ordering.
  for (const list of adjacency.values()) {
    list.sort((a, b) => a.to.localeCompare(b.to));
  }

  return { nodeById, adjacency };
}

/**
 * Deterministic A* pathfinder over `NavMap`.
 * Respects `blockedNodes` so unreachable destinations return `null` cleanly.
 */
export function findNavPath(
  index: NavGraphIndex,
  startId: string,
  goalId: string,
  blockedNodes?: ReadonlySet<string>,
): string[] | null {
  if (!index.nodeById.has(startId) || !index.nodeById.has(goalId)) return null;
  if (blockedNodes?.has(goalId)) return null;
  if (startId === goalId) return [startId];

  const goal = index.nodeById.get(goalId)!;
  const heuristic = (id: string): number => {
    const n = index.nodeById.get(id)!;
    return Math.hypot(goal.x - n.x, goal.z - n.z);
  };

  const open = new Set<string>([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const fScore = new Map<string, number>([[startId, heuristic(startId)]]);

  while (open.size > 0) {
    let current: string | null = null;
    let bestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF - 1e-9 || (Math.abs(f - bestF) <= 1e-9 && current !== null && id < current)) {
        bestF = f;
        current = id;
      }
    }
    if (!current) break;
    if (current === goalId) {
      const path: string[] = [current];
      let cur = current;
      while (cameFrom.has(cur)) {
        cur = cameFrom.get(cur)!;
        path.push(cur);
      }
      path.reverse();
      return path;
    }

    open.delete(current);
    const curG = gScore.get(current) ?? Infinity;
    const neighbors = index.adjacency.get(current) ?? [];

    for (const { to, edge } of neighbors) {
      if (blockedNodes?.has(to) && to !== startId) continue;
      const tentativeG = curG + edge.cost;
      if (tentativeG + 1e-9 < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentativeG);
        fScore.set(to, tentativeG + heuristic(to));
        open.add(to);
      }
    }
  }

  return null;
}

/** Nodes with at least one edge, per map (an unconnected node is never a usable start). */
const connectedCache = new WeakMap<NavMap, Set<string>>();
function connectedNodes(navMap: NavMap): Set<string> {
  let set = connectedCache.get(navMap);
  if (!set) {
    set = new Set<string>();
    for (const e of navMap.edges) { set.add(e.from); set.add(e.to); }
    connectedCache.set(navMap, set);
  }
  return set;
}

export function findNearestNavNode(
  navMap: NavMap,
  x: number,
  z: number,
  blockedNodes?: ReadonlySet<string>,
): NavNode | null {
  const connected = connectedNodes(navMap);
  let best: NavNode | null = null;
  let bestDist = Infinity;
  for (const node of navMap.nodes) {
    if (blockedNodes?.has(node.id) || !connected.has(node.id)) continue;
    const d = Math.hypot(node.x - x, node.z - z);
    if (d < bestDist - 1e-9 || (Math.abs(d - bestDist) <= 1e-9 && best && node.id < best.id)) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}
