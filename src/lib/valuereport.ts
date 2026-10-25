import { all, get, run } from "./db";
import { randomToken } from "./security";

/**
 * "Proof of value" report: what ProofMyAI caught, blocked and got fixed for a project in a period, compared with
 * the period before. Agencies send it to clients as proof the automations are working. Every number is a count of
 * real records; nothing is estimated.
 */

export interface Period { from: Date; to: Date; label: string }

export interface ValueNumbers {
  answersChecked: number;
  blockedBeforeSending: number;
  heldForReview: number;
  problemAnswers: number;
  highRiskAnswers: number;
  missedHandovers: number;
  agentRunsWatched: number;
  agentRunsWithIssues: number;
  actionsApproved: number;
  actionsRejected: number;
  rejectedValue: { currency: string; amount: number }[];
  workflowRunsWatched: number;
  silentFailures: number;
  workflowFailures: number;
  problemsCaught: number;
  problemsResolved: number;
  medianFixMinutes: number | null;
  byModule: { module: string; count: number }[];
}

export interface ValueReport { period: Period; previous: Period; now: ValueNumbers; before: ValueNumbers; highlights: string[] }

const iso = (d: Date) => d.toISOString();
const n = (sql: string, ...args: (string | number)[]) => get<{ n: number }>(sql, ...args)?.n ?? 0;
const IN = "datetime(?) AND datetime(?)";

/** A calendar month ("2026-10") or, by default, the last 30 days. */
export function periodFor(month: string | undefined, now = new Date()): { period: Period; previous: Period } {
  const m = month?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (m) {
    const from = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    const to = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
    const prevFrom = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 2, 1));
    const label = from.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    return { period: { from, to: to < now ? to : now, label }, previous: { from: prevFrom, to: from, label: prevFrom.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) } };
  }
  const from = new Date(now.getTime() - 30 * 86400000);
  return { period: { from, to: now, label: "Last 30 days" }, previous: { from: new Date(from.getTime() - 30 * 86400000), to: from, label: "the 30 days before" } };
}

export function valueNumbers(projectId: number, p: Period): ValueNumbers {
  const range = [iso(p.from), iso(p.to)];
  const item = (where: string) => n(
    `SELECT COUNT(*) AS n FROM audit_items i JOIN audits a ON a.id = i.audit_id
      WHERE a.project_id = ? AND datetime(COALESCE(i.created_at, a.created_at)) BETWEEN ${IN}${where}`, projectId, ...range,
  );
  const verdict = "COALESCE(i.corrected_verdict, i.verdict)";
  const presend = (d: string) => n(`SELECT COUNT(*) AS n FROM presend_checks WHERE project_id = ? AND decision = ? AND datetime(created_at) BETWEEN ${IN}`, projectId, d, ...range);
  const decided = (s: string) => n(`SELECT COUNT(*) AS n FROM approvals WHERE project_id = ? AND status = ? AND decided_by IS NOT NULL AND auto = 0 AND datetime(decided_at) BETWEEN ${IN}`, projectId, s, ...range);
  const inc = (where: string) => n(`SELECT COUNT(*) AS n FROM incidents WHERE project_id = ? AND datetime(created_at) BETWEEN ${IN}${where}`, projectId, ...range);
  const fixTimes = all<{ m: number }>(
    `SELECT (julianday(resolved_at) - julianday(created_at)) * 1440 AS m FROM incidents
      WHERE project_id = ? AND resolved = 1 AND resolved_at IS NOT NULL AND datetime(created_at) BETWEEN ${IN} ORDER BY m`, projectId, ...range,
  ).map((r) => r.m).filter((m) => m >= 0);
  return {
    answersChecked: item(""),
    blockedBeforeSending: presend("block"),
    heldForReview: presend("review"),
    problemAnswers: item(` AND ${verdict} <> 'correct'`),
    highRiskAnswers: item(` AND ${verdict} <> 'correct' AND i.severity = 'high'`),
    missedHandovers: item(` AND ${verdict} = 'should_escalate'`),
    agentRunsWatched: n(`SELECT COUNT(*) AS n FROM agent_runs WHERE project_id = ? AND datetime(created_at) BETWEEN ${IN}`, projectId, ...range),
    agentRunsWithIssues: n(`SELECT COUNT(*) AS n FROM agent_runs WHERE project_id = ? AND issues_json NOT IN ('[]', '') AND datetime(created_at) BETWEEN ${IN}`, projectId, ...range),
    actionsApproved: decided("approved"),
    actionsRejected: decided("rejected"),
    rejectedValue: all<{ currency: string; amount: number }>(
      `SELECT COALESCE(currency, '') AS currency, SUM(amount) AS amount FROM approvals
        WHERE project_id = ? AND status = 'rejected' AND auto = 0 AND amount > 0 AND datetime(decided_at) BETWEEN ${IN} GROUP BY 1 ORDER BY 2 DESC`, projectId, ...range,
    ),
    workflowRunsWatched: n(`SELECT COUNT(*) AS n FROM workflow_runs WHERE project_id = ? AND datetime(started_at) BETWEEN ${IN}`, projectId, ...range),
    silentFailures: inc(" AND code IN ('SILENT_FAILURE', 'EMPTY_OUTPUT', 'ITEMS_DROPPED', 'VOLUME_DROP', 'WORKFLOW_STOPPED', 'HEARTBEAT_MISSED', 'CRM_NO_NEW_RECORDS', 'SHEET_STALE')"),
    workflowFailures: inc(" AND module = 'workflows'"),
    problemsCaught: inc(""),
    problemsResolved: inc(" AND resolved = 1"),
    medianFixMinutes: fixTimes.length ? Math.round(fixTimes[Math.floor((fixTimes.length - 1) / 2)]) : null,
    byModule: all<{ module: string; count: number }>(`SELECT module, COUNT(*) AS count FROM incidents WHERE project_id = ? AND datetime(created_at) BETWEEN ${IN} GROUP BY 1 ORDER BY 2 DESC`, projectId, ...range),
  };
}

export const money = (v: { currency: string; amount: number }) =>
  v.currency ? new Intl.NumberFormat("en-GB", { style: "currency", currency: v.currency, maximumFractionDigits: 0 }).format(v.amount) : Math.round(v.amount).toLocaleString("en-GB");

export function durationLabel(min: number): string {
  if (min < 60) return `${Math.max(1, min)} min`;
  if (min < 2880) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} days`;
}

const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** The plain-English lines a client reads first. Only things that actually happened are mentioned. */
export function highlights(v: ValueNumbers): string[] {
  const out: string[] = [];
  if (v.blockedBeforeSending) out.push(`${plural(v.blockedBeforeSending, "wrong reply", "wrong replies")} stopped before reaching a customer`);
  if (v.heldForReview) out.push(`${plural(v.heldForReview, "reply", "replies")} held for a person to check before sending`);
  if (v.actionsRejected) out.push(`${plural(v.actionsRejected, "risky AI action")} stopped by a person${v.rejectedValue.length ? ` (worth ${v.rejectedValue.map(money).join(" + ")})` : ""}`);
  if (v.silentFailures) out.push(`${plural(v.silentFailures, "silent failure")} caught: automations that looked fine but weren't doing their job`);
  if (v.highRiskAnswers) out.push(`${plural(v.highRiskAnswers, "high-risk chatbot answer")} found and flagged for fixing`);
  if (v.missedHandovers) out.push(`${plural(v.missedHandovers, "conversation")} that needed a person spotted`);
  if (v.medianFixMinutes != null && v.problemsResolved) out.push(`${plural(v.problemsResolved, "problem")} fixed, typically within ${durationLabel(v.medianFixMinutes)}`);
  return out;
}

/** The last N days, compared with the N days before. */
export function lastDays(days: number, now = new Date()): { period: Period; previous: Period } {
  const from = new Date(now.getTime() - days * 86400000);
  return { period: { from, to: now, label: `Last ${days} days` }, previous: { from: new Date(from.getTime() - days * 86400000), to: from, label: `the ${days} days before` } };
}

export function reportFor(projectId: number, p: { period: Period; previous: Period }): ValueReport {
  const v = valueNumbers(projectId, p.period);
  return { period: p.period, previous: p.previous, now: v, before: valueNumbers(projectId, p.previous), highlights: highlights(v) };
}

export function valueReport(projectId: number, month?: string, now = new Date()): ValueReport {
  return reportFor(projectId, periodFor(month, now));
}

/** Read-only share link for the report (one per project; can be turned off). */
export function valueShareToken(projectId: number, create: boolean): string | null {
  const cur = get<{ t: string | null }>("SELECT value_share_token AS t FROM projects WHERE id = ?", projectId)?.t ?? null;
  if (cur || !create) return cur;
  const t = randomToken(18);
  run("UPDATE projects SET value_share_token = ? WHERE id = ?", t, projectId);
  return t;
}

export function revokeValueShare(projectId: number): void {
  run("UPDATE projects SET value_share_token = NULL WHERE id = ?", projectId);
}

/** The last 6 calendar months, for the month picker. */
export function recentMonths(now = new Date()): { value: string; label: string }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return { value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
}
