import { npcCanTakeDailyAction } from "../systems/NPCDecisionAI";
import {
  dayEndWarning,
  finishActionTiming,
  INSTANT_ACTION,
  type ActionTiming,
  type DayEndDecision,
  type DayEndWarning,
} from "../core/ActionTiming";
import { worldTime } from "../core/TimeSystem";
import { presenceOf } from "../board/presence";
import { ITEMS } from "../content/economy";
import { robberyTarget, ROBBERY_TARGETS } from "../content/robberyCareer";
import { BUSINESSES } from "../content/strategy";
import {
  ACTIONS,
  actionExecutionError,
  performAction,
  type Action,
} from "../core/ActionEngine";
import type { GameState } from "../core/GameState";
import {
  businessAction,
  businessError,
  BUSINESS_MAINTENANCE_COST,
} from "../systems/Businesses";
import {
  encounterDefinition,
  openEncounter,
  respondEncounter,
  responseError,
  syncEncounters,
} from "../systems/Encounters";
import { currentEmployment } from "../systems/Employment";
import { inventoryOf } from "../systems/Inventory";
import { beginQuanny } from "../systems/Quanny";
import { quannyLocation, QUANNY_HOME } from "../systems/QuannyState";
import { robberyStartError, startRobbery } from "../systems/Robbery";
import {
  dispositionError,
  offerTarget,
  opportunityError,
  pawnQuote,
  sellProperty,
} from "../systems/RobberyCareer";
import {
  lawfulLewis,
  lawfulLewisError,
  LEWIS_DELIVERY_WAGE,
  safeStory,
} from "../systems/StreetLife";
import {
  advanceStreetSession,
  endStreetSession,
  pauseStreetSession,
  startStreetSession,
  validateStartStreetSession,
} from "../systems/StreetSessions";
import { resolveReservoirLocation } from "./reservoirLocations";

export {
  resolveReservoirLocation,
  RESERVOIR_LOCATION_IDS,
} from "./reservoirLocations";

export interface LocationContext {
  actorId: string;
  locationId: string;
  /** Resolve an individual house at reservoir.homes. */
  propertyId?: string;
  /** Verified people at this location. Include the actor when acting as an NPC. */
  peopleHere?: readonly string[];
}

const socialActions = [
  "contact",
  "socialize",
  "inquire",
  "introduce",
  "offer",
  "transfer",
  "affiliate",
] as const;
const deliveryTiming: ActionTiming = { durationMinutes: 60, endsDay: false };
const businessActions = ["buy", "maintain", "sell", "close"] as const;
type BusinessAction = (typeof businessActions)[number];
type LocationActionType =
  | Action["type"]
  | `business:${BusinessAction}`
  | "lewisDelivery"
  | "meetQuanny"
  | "pawn"
  | "caseTarget"
  | "startRobbery"
  | "startTrapping"
  | "advanceTrapping"
  | "pauseTrapping"
  | "resumeTrapping"
  | "endTrapping"
  | "openEncounter"
  | "respondEncounter";

export interface LocationCommand {
  type: LocationActionType;
  targetId?: string;
  responseId?: string;
  cursor?: number;
}

export interface LocationAction {
  command: LocationCommand;
  label: string;
  /** Player AP and quoted cash flow. NPCs use the engine's daily action availability. */
  cost: { ap: number; cash?: number };
  timing: ActionTiming;
  confirmation: DayEndWarning | null;
  proceeds?: number;
  detail?: string;
  error: string | null;
}

type EngineResult = {
  state: GameState;
  error: string | null;
  confirmation?: DayEndWarning;
};
type Binding = LocationAction & {
  run: (decision?: DayEndDecision) => EngineResult;
};
const fromState = (state: GameState): EngineResult => ({ state, error: null });
const fromOutcome = (
  state: GameState,
  result: GameState | string,
): EngineResult =>
  typeof result === "string" ? { state, error: result } : fromState(result);

function inspect(state: GameState, context: LocationContext) {
  const { actorId, locationId, propertyId, peopleHere } = context;
  const location = resolveReservoirLocation(locationId);
  const actor = Object.hasOwn(state.characters, actorId)
    ? state.characters[actorId]
    : undefined;
  const property = location?.properties.find((p) => p.id === propertyId);
  const isPlayer = actorId === state.playerId;
  const error = !location
    ? "Unknown Reservoir location."
    : propertyId !== undefined && !property
      ? "Unknown property at this location."
      : !actor
        ? "Unknown actor."
        : null;
  const presenceError = (
    isPlayer
      ? presenceOf(state).location === locationId
      : peopleHere?.includes(actorId)
  )
    ? null
    : "Actor must be at this location.";
  const actions: Binding[] = [];
  const daytime = worldTime(state).isDaytime;
  const people = new Set(peopleHere);
  // Story state can relocate Quanny during an active scene. Lewis runs the market.
  if (quannyLocation(state) !== locationId) people.delete("quanny");
  if (locationId !== QUANNY_HOME) people.delete("mr-lewis");

  const add = (
    command: LocationCommand,
    label: string,
    ap: number,
    validate: () => string | null,
    run: Binding["run"],
    quote: {
      cash?: number;
      proceeds?: number;
      detail?: string;
      timing?: ActionTiming;
      daytimeOnly?: boolean;
    } = {},
  ) => {
    const { cash, timing = INSTANT_ACTION, daytimeOnly, ...details } = quote;
    const error =
      presenceError ??
      (daytimeOnly && !daytime
        ? "This service is closed after dark."
        : validate());
    actions.push({
      command,
      label,
      cost: { ap, ...(cash === undefined ? {} : { cash }) },
      ...details,
      timing,
      confirmation:
        error || !isPlayer ? null : dayEndWarning(state, ap, timing),
      error,
      run,
    });
  };
  const engine = (
    type: Action["type"],
    targetId?: string,
    fields: Partial<Omit<Action, "actor" | "type">> = {},
    quote?: Parameters<typeof add>[5],
  ) => {
    const action: Action = { type, actor: actorId, ...fields };
    const { durationMinutes, endsDay } = ACTIONS[type];
    add(
      { type, targetId },
      ACTIONS[type].label,
      isPlayer ? ACTIONS[type].ap : 0,
      () => actionExecutionError(state, action),
      (decision) => performAction(state, action, { decision }),
      {
        ...quote,
        timing: isPlayer ? { durationMinutes, endsDay } : INSTANT_ACTION,
        daytimeOnly: type === "buy" || type === "apply" || type === "work",
      },
    );
  };

  if (error || !location || !actor)
    return { error, location, property, actions };
  const links = location.links;
  for (const item of links.items ?? []) {
    const { name, price } = ITEMS[item];
    engine("buy", item, { item }, { detail: name, cash: price });
  }
  if (links.job) {
    const jobId = links.job;
    engine("apply", jobId, { jobId });
    engine("acceptJob", jobId, { jobId });
    const employment = currentEmployment(state, actorId);
    if (employment?.jobId === jobId) {
      engine("work", jobId, {}, { proceeds: employment.wage });
      engine("timeOff", jobId);
      engine("resign", jobId);
    }
  }
  // The legacy rest command represents the home district. A mapped door
  // requires a household assignment before it can represent the actor's home.
  if (links.rest && !property && actor.home === location.zone) engine("rest");

  if (links.people && !property) {
    for (const target of people) {
      if (
        target === actorId ||
        !Object.hasOwn(state.characters, target) ||
        (target === state.playerId && presenceOf(state).location !== locationId)
      )
        continue;
      for (const type of socialActions) {
        if (!isPlayer && type === "affiliate") continue;
        engine(
          type,
          target,
          { target },
          type === "offer" || type === "transfer"
            ? { cash: ACTIONS[type].amount }
            : {},
        );
      }
    }
  }
  if (links.street && !isPlayer)
    engine("crime", undefined, { market: location.zone });

  if (!isPlayer) return { error, location, property, actions };

  if (locationId === QUANNY_HOME && people.has("mr-lewis")) {
    add(
      { type: "lewisDelivery", targetId: "mr-lewis" },
      "Deliver groceries for Mr. Lewis",
      1,
      () => lawfulLewisError(state),
      () => {
        const next = structuredClone(state);
        lawfulLewis(next);
        return fromState(finishActionTiming(next, deliveryTiming, true));
      },
      {
        proceeds: LEWIS_DELIVERY_WAGE,
        timing: deliveryTiming,
        daytimeOnly: true,
      },
    );
  }
  if (locationId === QUANNY_HOME && people.has("quanny")) {
    if (state.quanny.met) {
      engine("quanny", "quanny", { target: "quanny" });
    } else {
      add(
        { type: "meetQuanny", targetId: "quanny" },
        "Meet Quanny",
        0,
        () =>
          !safeStory(state) ||
          state.characters.quanny?.status !== "active" ||
          state.characters.quanny.availableDay > state.day
            ? "Quanny isn’t available right now."
            : null,
        () => {
          const next = structuredClone(state);
          if (!beginQuanny(next, locationId, "gameplay"))
            return { state, error: "Quanny isn’t available right now." };
          syncEncounters(next);
          return fromState(next);
        },
      );
    }
  }

  for (const encounter of state.encounters) {
    if (encounter.status !== "active" && encounter.status !== "pending")
      continue;
    const scene = state.danger.scenes.find(
      (s) => s.id === encounter.dangerSceneId,
    );
    const here = scene
      ? scene.location === locationId
      : encounter.definitionId === "quanny"
        ? quannyLocation(state) === locationId
        : encounter.definitionId === "workplace"
          ? !!links.job &&
            state.employment.some(
              (e) =>
                e.actor === actorId &&
                e.jobId === links.job &&
                !!encounter.sourceEventId &&
                e.eventIds.includes(encounter.sourceEventId),
            )
          : false;
    if (
      !here ||
      !encounter.participants.every(
        (id) => id === actorId || peopleHere?.includes(id),
      )
    )
      continue;
    const definition = encounterDefinition(encounter);
    if (!definition.eligible(state, encounter) || presenceError) continue;
    const targetId = encounter.id;
    const detail = definition.dialogue(state, encounter);
    if (encounter.status === "pending")
      add(
        { type: "openEncounter", targetId },
        "Continue conversation",
        0,
        () => (safeStory(state) ? null : "Finish what you’re doing first."),
        () => fromState(openEncounter(state, targetId)),
        { detail },
      );
    else
      for (const response of definition.responses(state, encounter)) {
        const { ap, durationMinutes, endsDay } =
          response.effect.type === "action"
            ? ACTIONS[response.effect.action.type]
            : { ...INSTANT_ACTION, ap: 0 };
        add(
          { type: "respondEncounter", targetId, responseId: response.id },
          response.label,
          ap,
          () => responseError(state, encounter, response),
          (decision) =>
            respondEncounter(state, targetId, response.id, decision),
          {
            detail: response.detail ?? detail,
            timing: { durationMinutes, endsDay },
          },
        );
      }
  }

  if (links.business) {
    const business = BUSINESSES.find((b) => b.id === links.business);
    if (business)
      for (const action of businessActions) {
        add(
          { type: `business:${action}`, targetId: business.id },
          `${action} ${business.name}`,
          1,
          () => businessError(state, business.id, action),
          () => businessAction(state, business.id, action),
          action === "buy"
            ? { cash: business.cost }
            : action === "maintain"
              ? { cash: BUSINESS_MAINTENANCE_COST }
              : {},
        );
      }
  }
  if (links.pawn) {
    for (const slot of inventoryOf(state).slots) {
      const quote = pawnQuote(state, slot.id);
      if (quote)
        add(
          { type: "pawn", targetId: slot.id },
          "Pawn stolen property",
          0,
          () => dispositionError(state, slot.id),
          () => fromOutcome(state, sellProperty(state, slot.id)),
          { proceeds: quote.price, detail: slot.itemId, daytimeOnly: true },
        );
    }
  }

  if (links.street) {
    const session = state.activeSession;
    if (session?.location === locationId && session.status !== "ended") {
      const targetId = session.id;
      if (session.status === "active")
        add(
          { type: "advanceTrapping", targetId, cursor: session.cursor },
          "Resolve street activity",
          0,
          () =>
            session.cursor < session.beats.length
              ? null
              : "No remaining street activity.",
          () =>
            fromState(advanceStreetSession(state, targetId, session.cursor)),
        );
      const paused = session.status === "paused";
      add(
        { type: paused ? "resumeTrapping" : "pauseTrapping", targetId },
        paused ? "Resume trapping" : "Pause trapping",
        0,
        () => null,
        () => fromState(pauseStreetSession(state, targetId, !paused)),
      );
      add(
        { type: "endTrapping", targetId },
        "End trapping",
        0,
        () => null,
        () => fromState(endStreetSession(state, targetId)),
      );
    } else {
      add(
        { type: "startTrapping" },
        "Start trapping",
        1,
        () => validateStartStreetSession(state, locationId),
        () => startStreetSession(state, locationId),
      );
    }
  }

  const targets = ROBBERY_TARGETS.filter(
    (t) =>
      t.location === locationId &&
      (!location.properties.length ||
        location.properties.some((p) => p.targetId === t.id)) &&
      (!property || t.id === property.targetId),
  );
  for (const target of targets)
    add(
      { type: "caseTarget", targetId: target.id },
      `Case ${property?.label ?? target.name}`,
      0,
      () =>
        location.properties.length && !property
          ? "Choose the mapped house first."
          : opportunityError(state, target.id),
      () => fromOutcome(state, offerTarget(state, target.id)),
      { detail: target.circumstance },
    );

  for (const job of state.robberies?.jobs ?? []) {
    if (job.location !== locationId || job.status !== "offered") continue;
    const target = job.targetId ? robberyTarget(job.targetId) : undefined;
    // Preserve offers saved at the boarded house, including legacy home leads.
    if (location.properties.length && (!target || !targets.includes(target)))
      continue;
    add(
      { type: "startRobbery", targetId: job.id },
      `Start ${property?.label ?? target?.name ?? "robbery"}`,
      1,
      () =>
        location.properties.length && !property
          ? "Choose the mapped house first."
          : robberyStartError(state, job.id),
      () => startRobbery(state, job.id),
    );
  }

  return { error, location, property, actions };
}

export function queryLocation(state: GameState, context: LocationContext) {
  const { actions, ...location } = inspect(state, context);
  const territory = location.location?.links.politics
    ? state.strategic.territories[location.location.zone]
    : undefined;
  const controller = territory?.controller ?? null;
  return {
    ...location,
    actions: actions.map(({ run: _run, ...action }) => action),
    politics: territory
      ? {
          territory: structuredClone(territory),
          controller: controller
            ? { id: controller, name: state.factions[controller].name }
            : null,
        }
      : null,
  };
}

function findCommand(
  state: GameState,
  context: LocationContext,
  command: LocationCommand,
) {
  const { error, actions } = inspect(state, context);
  const action = actions.find(
    ({ command: candidate }) =>
      candidate.type === command.type &&
      candidate.targetId === command.targetId &&
      candidate.responseId === command.responseId &&
      candidate.cursor === command.cursor,
  );
  return {
    action,
    error:
      error ??
      (action
        ? action.error
        : "Action or target unavailable at this location."),
  };
}

export function validateLocationAction(
  state: GameState,
  context: LocationContext,
  command: LocationCommand,
) {
  return findCommand(state, context, command).error;
}

export function executeLocationAction(
  state: GameState,
  context: LocationContext,
  command: LocationCommand,
  decision?: DayEndDecision,
) {
  const { action, error } = findCommand(state, context, command);
  const result =
    decision === "cancel"
      ? { state, error: null }
      : error || !action
        ? { state, error }
        : action.run(decision);
  const { actorId } = context;
  const next = result.state;
  const before = Object.hasOwn(state.characters, actorId)
    ? state.characters[actorId]
    : undefined;
  const after = before && next.characters[actorId];
  return {
    ...result,
    command,
    changed: next !== state,
    changes: {
      apSpent:
        next.day !== state.day ? (action?.cost.ap ?? 0) : state.ap - next.ap,
      daysElapsed: next.day - state.day,
      actorActionDay: after?.lastActionDay ?? null,
      wallet:
        before && after
          ? {
              clean: after.wallet.clean - before.wallet.clean,
              illicit: after.wallet.illicit - before.wallet.illicit,
            }
          : null,
      eventIds: next.events.slice(state.events.length).map((e) => e.id),
      inventoryExchangeIds: (next.inventory?.history ?? [])
        .slice(state.inventory?.history.length ?? 0)
        .map((exchange) => exchange.id),
      streetTransactionIds: next.street.transactions
        .slice(state.street.transactions.length)
        .map((tx) => tx.id),
    },
  };
}

export interface NpcPresenceObservation {
  locationId: string;
  propertyId?: string;
  time: Pick<ReturnType<typeof worldTime>, "day" | "minuteOfDay">;
  peopleHere: readonly string[];
}

export interface NpcLocationIntent {
  actorId: string;
  command: LocationCommand;
  day: number;
}

/** The trusted host supplies fresh co-presence from Gemini for an existing engine action. */
export function executeNpcLocationIntent(
  state: GameState,
  intent: NpcLocationIntent,
  presence: NpcPresenceObservation,
) {
  const { actorId, command, day } = intent;
  const actor = Object.hasOwn(state.characters, actorId) ? state.characters[actorId] : undefined;
  const time = worldTime(state);
  const rejected = (error: string) => ({ state, error, eventIds: [] as string[] });
  if (!actor || actorId === state.playerId) return rejected("Choose a simulated character.");
  if (time.day !== day || presence.time.day !== day || presence.time.minuteOfDay !== time.minuteOfDay)
    return rejected("That observation is out of date.");
  if (!npcCanTakeDailyAction(state, actor)) return rejected("They’re busy right now.");
  const result = executeLocationAction(state, { ...presence, actorId }, command);
  return { state: result.state, error: result.error, eventIds: result.changes.eventIds };
}
