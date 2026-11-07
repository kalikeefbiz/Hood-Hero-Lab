import { settleCareer } from "./RobberyCareer";
import type { GameState } from "../core/GameState";
import { record } from "../core/EventLog";
import { awardSkill } from "./Skills";
export function finishSessionPartner(s: GameState) {
  const session = s.activeSession!;
  if (s.streetLife?.lesson === 'started') s.streetLife.lesson = 'complete';
  if (!session.partner) return;
  const a = s.assignments.find(
    (a) =>
      a.member === session.partner &&
      a.status === "active" &&
      a.activity === "partner-crime",
  );
  if (!a) return;
  a.status = "resolved";
  a.success = session.totals.sold > 0;
  a.outcome = `Shared street transaction · City session: ${session.totals.sold} sold; actual shares paid per buyer.`;
  const e = record(s, "crew", a.outcome, a.participants);
  a.eventIds.push(e.id);
  const promise = s.commitments.find((c) => c.id === a.commitmentId);
  if (promise) {
    promise.status = a.success ? "fulfilled" : "released";
    promise.evidence.push(e.id);
  }
  if (a.success) {
    awardSkill(s, s.playerId, "leadership", 100, a.id);
    awardSkill(s, a.member, "leadership", 50, a.id);
  }
}
/** Stop future beats while settling only outcomes already committed. Mutates an owned snapshot. */
export function interruptSession(s: GameState, reason: string) {
  if (s.activeRobbery?.career && s.activeRobbery.status !== 'ended')
    settleCareer(s, false, true);
  if (s.activeRobbery && s.activeRobbery.status !== 'ended') {
    s.activeRobbery.status = 'ended'; s.activeRobbery.text = reason;
    const job=s.robberies?.jobs.find(j=>j.id===s.activeRobbery!.jobId);
    if (job && job.status==='active') job.status='failed';
  }
  const a = s.activeSession;
  if (!a || a.status === "ended") return;
  a.status = "ended";
  a.reason = reason;
  // Arrest may occur inside a buyer's atomic settlement, before its totals/cursor commit.
  // That transition finishes the partner immediately after committing the current buyer.
  if (
    !s.street.transactions.some(
      (t) => t.sessionId === a.id && t.sessionCursor === a.cursor,
    )
  )
    finishSessionPartner(s);
}
