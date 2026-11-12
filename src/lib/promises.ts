import { all, get, run } from "./db";
import { raiseIncident } from "./incidents";
import { truncate } from "./text";

/**
 * Promised follow-ups: "I'll check and get back to you" breaks no policy, so answer checks pass it. But it is a
 * commitment to future work, and if nothing is created behind it the customer just waits. Each promise in a live
 * conversation is tracked until it is kept: a task/ticket id is reported for it (task_id on the reply, or
 * POST /api/v1/followups), or the bot follows up in the same conversation. Otherwise it is alerted when it's
 * overdue, and straight away if the customer chases it ("any update?").
 */

// The bot commits to doing something later.
const PROMISE = /\b(?:i(?:'ll| will| am going to|'m going to)|we(?:'ll| will| are going to|'re going to)|let me|someone(?: from (?:our|the) team)? will|(?:a member of )?(?:our|the) (?:team|support team|staff|agent|manager|specialist)s? will|you(?:'ll| will) (?:receive|get|hear))\b[^.!?\n]{0,60}?\b(?:check(?:ing)?|look(?:ing)? into|get back|come back|follow(?:ing)?[ -]up|email|call|ring|text|message|contact|reach out|let you know|update you|keep you (?:posted|updated)|confirm|send|arrange|investigate|escalate|raise a ticket|open a ticket|be in touch|hear (?:back|from))\b[^.!?\n]*[.!?]?/i;
// The customer chases a promise.
const CHASE = /\b(?:any (?:update|news|progress)|still waiting|still haven'?t|haven'?t heard|have not heard|no ?one (?:got back|called|replied|emailed|contacted)|nobody (?:got back|called|replied|emailed|contacted)|you (?:said|promised)|what happened (?:to|with) my|following up on|i was told (?:someone|you) would)\b/i;
// "Let me know if…", "I'll be happy to help" are not promises of later work.
const NOT_A_PROMISE = /\b(?:let me know if|let us know if|feel free to)\b/i;

export const DEFAULT_PROMISE_HOURS = 24;

/** The promise in a reply ("I'll check with the warehouse and get back to you today."), or null. */
export function promiseIn(answer: string): string | null {
  const m = answer.match(PROMISE);
  if (!m) return null;
  if (NOT_A_PROMISE.test(m[0]) && !/\b(?:get back|follow[ -]up|call|email|contact|be in touch)\b/i.test(m[0])) return null;
  return m[0].trim();
}

export const chasesPromise = (message: string) => CHASE.test(message);

interface OpenPromise { id: number; conversation_id: string; promise: string; created_at: string; due_at: string }

/** A bot reply in a live conversation: earlier open promises are kept (it followed up), and a new promise is recorded. */
export function trackReply(projectId: number, conversation: string, answer: string, opts: { taskId?: string | null; storeText?: boolean; now?: Date } = {}): number | null {
  const now = opts.now ?? new Date();
  const promise = promiseIn(answer);
  if (!promise) {
    run("UPDATE promises SET status = 'kept', closed_at = ? WHERE project_id = ? AND conversation_id = ? AND status = 'open'", now.toISOString(), projectId, conversation);
    return null;
  }
  const hours = get<{ h: number | null }>("SELECT promise_hours AS h FROM projects WHERE id = ?", projectId)?.h ?? DEFAULT_PROMISE_HOURS;
  const due = new Date(now.getTime() + Math.max(1, hours) * 3600000).toISOString();
  return Number(run(
    "INSERT INTO promises (project_id, conversation_id, promise, status, task_ref, created_at, due_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    projectId, conversation, opts.storeText === false ? "" : truncate(promise, 300), opts.taskId ? "tasked" : "open", opts.taskId ?? null,
    now.toISOString(), due, opts.taskId ? now.toISOString() : null,
  ).lastInsertRowid);
}

/** A task or ticket was created for this conversation's open promises. */
export function recordFollowUp(projectId: number, conversation: string, taskId: string, done = false, now = new Date()): number {
  return run(
    "UPDATE promises SET status = ?, task_ref = ?, closed_at = ? WHERE project_id = ? AND conversation_id = ? AND status IN ('open', 'broken')",
    done ? "kept" : "tasked", truncate(taskId, 200), now.toISOString(), projectId, conversation,
  ).changes;
}

/** A customer message: if it chases an open promise, alert now (the customer is already waiting). */
export async function trackCustomerMessage(projectId: number, conversation: string, message: string, now = new Date()): Promise<boolean> {
  if (!chasesPromise(message)) return false;
  const open = get<OpenPromise>(
    "SELECT id, conversation_id, promise, created_at, due_at FROM promises WHERE project_id = ? AND conversation_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", projectId, conversation,
  );
  if (!open) return false;
  run("UPDATE promises SET status = 'broken', closed_at = ? WHERE project_id = ? AND conversation_id = ? AND status = 'open'", now.toISOString(), projectId, conversation);
  await raiseIncident(projectId, {
    module: "chatbot", code: "PROMISE_CHASED", severity: "high",
    title: "A customer is chasing a follow-up the bot promised",
    detail: `Conversation ${conversation}: the bot promised${open.promise ? ` "${open.promise}"` : " to follow up"}, and no task or follow-up was recorded. The customer has now written: "${truncate(message, 160)}". Reply to them, then create the task the bot's promise needs.`,
    dedupeKey: `promise:${open.id}`,
  });
  return true;
}

/** Promises past their deadline with no task and no follow-up: one alert per check, listing them. */
export async function overduePromises(projectId: number, now = new Date()): Promise<number> {
  const due = all<OpenPromise>(
    "SELECT id, conversation_id, promise, created_at, due_at FROM promises WHERE project_id = ? AND status = 'open' AND due_at <= ? ORDER BY id", projectId, now.toISOString(),
  );
  if (!due.length) return 0;
  run(`UPDATE promises SET status = 'broken', closed_at = ? WHERE id IN (${due.map(() => "?").join(",")})`, now.toISOString(), ...due.map((p) => p.id));
  const n = due.length;
  const list = due.slice(0, 3).map((p) => `${p.conversation_id}${p.promise ? `: "${truncate(p.promise, 90)}"` : ""}`).join(" · ");
  await raiseIncident(projectId, {
    module: "chatbot", code: "PROMISE_NOT_KEPT", severity: "medium",
    title: `${n} promised follow-up${n === 1 ? " wasn't" : "s weren't"} done`,
    detail: `The bot promised to get back to ${n === 1 ? "a customer" : `${n} customers`}, and no task, ticket or follow-up was recorded in time. ${list}${n > 3 ? " …" : ""}. Send task_id with the bot's reply (or POST /api/v1/followups) when a task is created, so kept promises are recognised.`,
    dedupeKey: `promises:${due[0].id}`,
  });
  return n;
}

export function promiseStats(projectId: number, days = 30): { made: number; kept: number; open: number; broken: number } {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const r = get<{ made: number; kept: number; open: number; broken: number }>(
    `SELECT COUNT(*) AS made, SUM(status IN ('kept', 'tasked')) AS kept, SUM(status = 'open') AS open, SUM(status = 'broken') AS broken
       FROM promises WHERE project_id = ? AND created_at >= ?`, projectId, since,
  );
  return { made: r?.made ?? 0, kept: r?.kept ?? 0, open: r?.open ?? 0, broken: r?.broken ?? 0 };
}
