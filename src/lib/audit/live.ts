import { z } from "zod";
import { all, get, run, transaction } from "../db";
import { raiseIncident, resolveIncidents } from "../incidents";
import { buildKbIndex } from "../judge/features";
import { heuristicGrade } from "../judge/heuristic";
import { aiForProject, JudgeError, judgeLabel, llmGradeConversation } from "../judge/llm";
import { exchangesOf, VERDICT_LABELS, type Exchange, type Grade, type Turn } from "../judge/types";
import { loadModel } from "../ml/risk";
import { projectRules } from "../rules";
import { truncate } from "../text";
import { customMatcher, redactPII } from "../pii";
import { sha256 } from "../security";
import { normaliseRole } from "./parse";
import { kbDocs, NOT_STORED, scoreFromSeverities, storeGradedItem, type ReplyMeta } from "./run";
import { watchSoon } from "../watches";
import { trackCustomerMessage } from "../promises";

/**
 * Live chatbot monitoring: bots send each conversation (or each new reply) as it happens.
 * New replies are graded straight away and stored in a daily "Live chats" audit, so the
 * fix list, feedback buttons and neural model work on live traffic exactly like on uploads.
 */
export const LiveChatSchema = z
  .object({
    conversation_id: z.string().min(1).max(200),
    bot_name: z.string().max(100).optional(),
    messages: z.array(z.object({ role: z.string().max(40), content: z.string().max(20000) })).min(1).max(300).optional(),
    question: z.string().max(20000).optional(),
    answer: z.string().max(20000).optional(),
    // Optional operational data about the bot's reply.
    latency_ms: z.number().int().min(0).max(3_600_000).optional(),
    cost_usd: z.number().min(0).max(1000).optional(),
    error: z.string().max(500).optional(),
    /** The text chunks your bot retrieved (RAG) for this reply: used to tell retrieval failures from generation failures. Never stored. */
    retrieved: z.array(z.string().max(20000)).max(50).optional(),
    /** Your id for one end-to-end request (chat → agent → workflow → CRM), to see everything it touched on one timeline. */
    trace_id: z.string().min(1).max(200).optional(),
    /** The task or ticket your system created for this reply, when the reply promises a follow-up ("I'll get back to you"). */
    task_id: z.string().min(1).max(200).optional(),
  })
  .refine((d) => d.messages || (d.answer ?? "").trim() !== "" || (d.question ?? "").trim() !== "", {
    message: "Send messages[], question + answer, or just question (a customer message the bot has not answered yet)",
  });
export type LiveChat = z.infer<typeof LiveChatSchema>;

/** Conversation ids that are phone numbers or WhatsApp ids ("923001234567", "+44 7700…", "92300…@c.us") are hashed. */
export function anonymiseConversationId(id: string): string {
  const phoneLike = /^\+?\d[\d\s().-]{6,}$/.test(id.trim()) || /@(c\.us|s\.whatsapp\.net|lid)$/.test(id.trim());
  return phoneLike ? `tel-${sha256(`conv:${id.replace(/[^\d@a-z.]/gi, "")}`).slice(0, 12)}` : id;
}

/** Masks personal data in a live event before anything is stored or sent to the judge. */
export function redactChat(chat: LiveChat, custom: RegExp | null = null): LiveChat {
  return {
    ...chat,
    conversation_id: anonymiseConversationId(chat.conversation_id),
    messages: chat.messages?.map((m) => ({ ...m, content: redactPII(m.content, custom) })),
    question: chat.question === undefined ? undefined : redactPII(chat.question, custom),
    answer: chat.answer === undefined ? undefined : redactPII(chat.answer, custom),
  };
}

export function liveAuditName(date = new Date()): string {
  return `Live chats · ${date.toISOString().slice(0, 10)}`;
}

/** Today's live audit for the project, created on first use. */
export function liveAuditId(projectId: number): number {
  const name = liveAuditName();
  const existing = get<{ id: number }>("SELECT id FROM audits WHERE project_id = ? AND status = 'live' AND name = ?", projectId, name);
  if (existing) return existing.id;
  return run(
    "INSERT INTO audits (project_id, name, mode, status, judge) VALUES (?, ?, ?, 'live', ?)",
    projectId, name, aiForProject(projectId) ? "ai" : "basic", judgeLabel(projectId),
  ).lastInsertRowid;
}

export function toTurns(chat: LiveChat): Turn[] {
  if (chat.messages) {
    return chat.messages.flatMap((m, i) => {
      if (m.role.toLowerCase() === "system") return [];
      const role = normaliseRole(m.role);
      if (!role) throw new Error(`messages[${i}]: unknown role "${m.role}". Use user/customer or assistant/bot.`);
      return [{ role, content: m.content.trim() }];
    });
  }
  return [
    { role: "user", content: (chat.question ?? "").trim() },
    { role: "assistant", content: (chat.answer ?? "").trim() },
  ];
}

/** Replies of this conversation that have not been graded yet (bots may resend the whole history). */
export function newExchanges(projectId: number, chat: LiveChat): Exchange[] {
  const id = conversationKey(chat);
  if (!chat.messages && !(chat.answer ?? "").trim()) return []; // customer message only: nothing to grade yet
  const exchanges = exchangesOf({ id, turns: toTurns(chat) });
  if (!chat.messages) {
    // Single question/answer events: number them after what we already have for this conversation,
    // and give the conversation checks the earlier turns we stored (when the project keeps text).
    const prior = all<{ question: string; answer: string; turn_index: number }>(
      `SELECT i.question, i.answer, i.turn_index FROM audit_items i JOIN audits a ON a.id = i.audit_id
        WHERE a.project_id = ? AND a.status = 'live' AND i.conversation_id = ? ORDER BY i.turn_index`, projectId, id,
    );
    const last = prior.length ? prior[prior.length - 1].turn_index : -1;
    const context: Turn[] = prior.filter((r) => r.answer !== NOT_STORED).slice(-10)
      .flatMap((r) => [...(r.question ? [{ role: "user" as const, content: r.question }] : []), { role: "assistant" as const, content: r.answer }]);
    return exchanges.map((e) => ({ ...e, turnIndex: last + 2, context }));
  }
  const done = new Set(
    all<{ turn_index: number }>(
      `SELECT i.turn_index FROM audit_items i JOIN audits a ON a.id = i.audit_id
        WHERE a.project_id = ? AND a.status = 'live' AND i.conversation_id = ?`, projectId, id,
    ).map((r) => r.turn_index),
  );
  return exchanges.filter((e) => !done.has(e.turnIndex));
}

/** Grades new replies and stores them. Returns the stored grades. Never throws on judge failures. */
export async function gradeLiveChat(projectId: number, exchanges: Exchange[], meta: ReplyMeta = {}): Promise<Grade[]> {
  if (exchanges.length === 0) return [];
  const docs = kbDocs(projectId);
  const index = buildKbIndex(docs);
  let grades: Grade[];
  let note = "";
  if (aiForProject(projectId)) {
    try {
      grades = await llmGradeConversation(exchanges, docs, { projectId, kind: "live" });
    } catch (err) {
      // Live monitoring must keep working when the AI judge is down or over quota.
      grades = exchanges.map((e) => heuristicGrade(e, index));
      note = ` (basic check - AI judge unavailable: ${err instanceof JudgeError ? err.message : "error"})`;
    }
  } else {
    grades = exchanges.map((e) => heuristicGrade(e, index));
  }

  const auditId = liveAuditId(projectId);
  const model = loadModel(projectId);
  const rules = projectRules(projectId);
  transaction(() => {
    // Latency, cost and errors describe the newest reply.
    grades = exchanges.map((e, i) => storeGradedItem(auditId, e, grades[i], index, model, rules, note, i === exchanges.length - 1 ? meta : {}));
    const severities = all<{ severity: "none" | "low" | "medium" | "high" }>("SELECT severity FROM audit_items WHERE audit_id = ?", auditId).map((r) => r.severity);
    run("UPDATE audits SET score = ? WHERE id = ?", scoreFromSeverities(severities), auditId);
  });

  const storeText = storesText(projectId);
  for (const [i, g] of grades.entries()) {
    if (g.severity !== "high") continue;
    await raiseIncident(projectId, {
      module: "chatbot", code: `LIVE_${g.verdict.toUpperCase()}`, severity: "high",
      title: `Live chatbot answer flagged: ${VERDICT_LABELS[g.verdict]}`,
      // Results-only projects never put conversation text into alerts either.
      detail: storeText
        ? `Customer: “${truncate(exchanges[i].question, 160)}”\nBot: “${truncate(exchanges[i].answer, 200)}”\nWhy: ${g.reason}`
        : `Conversation ${exchanges[i].conversationId}. Why: ${g.reason}`,
      dedupeKey: `live-chat:${g.verdict}`,
    });
  }
  return grades;
}

const storesText = (projectId: number) => (get<{ s: number }>("SELECT store_text AS s FROM projects WHERE id = ?", projectId)?.s ?? 1) === 1;

// ---------- Missing replies ----------

/**
 * Remembers customer messages that have not been answered yet (the last message is from the customer),
 * and clears them when the bot's reply arrives. Bots that time out or crash never send a reply, so
 * this is the only way to see them.
 */
export function trackPendingReply(projectId: number, chat: LiveChat, receivedAt = new Date().toISOString()): "pending" | "answered" | "none" {
  const id = conversationKey(chat);
  const turns = toTurns(chat).filter((t) => t.content);
  const last = turns[turns.length - 1];
  if (!last) return "none";
  if (last.role === "assistant") {
    run("DELETE FROM pending_replies WHERE project_id = ? AND conversation_id = ?", projectId, id);
    // Everyone who was alerted about has now been answered: close the alert so the next miss alerts again.
    if (!get("SELECT 1 FROM pending_replies WHERE project_id = ? AND alerted = 1", projectId)) resolveIncidents(projectId, "live-chat:no-reply");
    return "answered";
  }
  const question = storesText(projectId) ? truncate(last.content, 2000) : NOT_STORED;
  // Keep the time of the first unanswered message; a follow-up message doesn't reset the clock.
  run(
    `INSERT INTO pending_replies (project_id, conversation_id, question, received_at, error) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id, conversation_id) DO UPDATE SET question = excluded.question, error = COALESCE(excluded.error, pending_replies.error)`,
    projectId, id, question, receivedAt, chat.error ?? null,
  );
  return "pending";
}

export interface Unanswered { conversation_id: string; question: string; received_at: string; error: string | null; waiting_sec: number }

/** Customer messages still without a reply after the project's timeout. */
export function unansweredMessages(projectId: number, limit = 50): Unanswered[] {
  const timeout = get<{ t: number }>("SELECT reply_timeout_sec AS t FROM projects WHERE id = ?", projectId)?.t ?? 120;
  if (timeout <= 0) return [];
  const cutoff = new Date(Date.now() - timeout * 1000).toISOString();
  return all<Omit<Unanswered, "waiting_sec">>(
    "SELECT conversation_id, question, received_at, error FROM pending_replies WHERE project_id = ? AND received_at <= ? ORDER BY received_at DESC LIMIT ?",
    projectId, cutoff, limit,
  ).map((r) => ({ ...r, waiting_sec: Math.round((Date.now() - Date.parse(r.received_at)) / 1000) }));
}

/** Raises one incident per project for messages the bot never answered. Called on each event and by the cron. */
export async function alertMissingReplies(projectId?: number): Promise<number> {
  run("DELETE FROM pending_replies WHERE received_at < ?", new Date(Date.now() - 7 * 86400000).toISOString());
  const projects = projectId ? [{ id: projectId }] : all<{ id: number }>("SELECT DISTINCT project_id AS id FROM pending_replies WHERE alerted = 0");
  let alerted = 0;
  for (const p of projects) {
    const missing = unansweredMessages(p.id).filter((m) => !get<{ a: number }>("SELECT alerted AS a FROM pending_replies WHERE project_id = ? AND conversation_id = ?", p.id, m.conversation_id)?.a);
    if (!missing.length) continue;
    const errors = missing.filter((m) => m.error).map((m) => m.error);
    await raiseIncident(p.id, {
      module: "chatbot", code: "NO_REPLY", severity: "high",
      title: `Your bot did not reply to ${missing.length} customer message${missing.length === 1 ? "" : "s"}`,
      detail: `Oldest has waited ${Math.round(Math.max(...missing.map((m) => m.waiting_sec)) / 60)} min. Conversations: ${missing.slice(0, 5).map((m) => m.conversation_id).join(", ")}${errors.length ? `. Bot errors: ${[...new Set(errors)].slice(0, 3).join("; ")}` : ""}.`,
      dedupeKey: "live-chat:no-reply",
    });
    for (const m of missing) run("UPDATE pending_replies SET alerted = 1 WHERE project_id = ? AND conversation_id = ?", p.id, m.conversation_id);
    alerted += missing.length;
  }
  return alerted;
}

export interface LiveMetrics { replies: number; conversations: number; avgLatencyMs: number | null; slowReplies: number; costPerConversation: number | null; errors: number; fallbacks: number; conversationProblems: number; unanswered: number }

/** Last-24-hour operational health of the chatbot, from live events. */
export function liveMetrics(projectId: number): LiveMetrics {
  const r = get<{ replies: number; conversations: number; lat: number | null; slow: number; cost: number | null; errors: number; fallbacks: number; problems: number }>(
    `SELECT COUNT(*) AS replies, COUNT(DISTINCT i.conversation_id) AS conversations, AVG(i.latency_ms) AS lat,
            SUM(CASE WHEN i.latency_ms > 10000 THEN 1 ELSE 0 END) AS slow, SUM(i.cost_usd) AS cost,
            SUM(CASE WHEN i.bot_error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
            SUM(CASE WHEN i.conv_flags LIKE '%fallback%' THEN 1 ELSE 0 END) AS fallbacks,
            SUM(CASE WHEN i.conv_flags IS NOT NULL THEN 1 ELSE 0 END) AS problems
       FROM audit_items i JOIN audits a ON a.id = i.audit_id
      WHERE a.project_id = ? AND a.status = 'live' AND i.created_at >= datetime('now', '-1 day')`, projectId,
  )!;
  const pendingErrors = get<{ n: number }>("SELECT COUNT(*) AS n FROM pending_replies WHERE project_id = ? AND error IS NOT NULL", projectId)?.n ?? 0;
  return {
    replies: r.replies, conversations: r.conversations,
    avgLatencyMs: r.lat == null ? null : Math.round(r.lat), slowReplies: r.slow ?? 0,
    costPerConversation: r.cost == null || !r.conversations ? null : r.cost / r.conversations,
    errors: (r.errors ?? 0) + pendingErrors, fallbacks: r.fallbacks ?? 0, conversationProblems: r.problems ?? 0,
    unanswered: unansweredMessages(projectId, 1000).length,
  };
}

// ---------- One entry point for API events, test events and connectors ----------

export function conversationKey(chat: LiveChat): string {
  return chat.bot_name ? `${chat.bot_name}:${chat.conversation_id}` : chat.conversation_id;
}

/** Masks, tracks missing replies and grades new replies of one live event. */
export async function processLiveChat(
  project: { id: number; redact_pii: number; mask_terms: string | null },
  raw: LiveChat,
  opts: { wait?: boolean; receivedAt?: string; trackPromises?: boolean } = {},
): Promise<{ exchanges: Exchange[]; grades: Promise<Grade[]> }> {
  const chat = project.redact_pii ? redactChat(raw, customMatcher(project.mask_terms)) : raw;
  trackPendingReply(project.id, chat, opts.receivedAt);
  // A customer chasing a promised follow-up ("any update?") is alerted straight away.
  const lastCustomer = [...toTurns(chat)].reverse().find((t) => t.role === "user")?.content;
  if (lastCustomer) await trackCustomerMessage(project.id, conversationKey(chat), lastCustomer).catch((err) => console.error("[promises] failed:", err));
  const exchanges = newExchanges(project.id, chat);
  const meta: ReplyMeta = { latencyMs: chat.latency_ms, costUsd: chat.cost_usd, error: chat.error, retrieved: raw.retrieved, traceId: chat.trace_id, taskId: chat.task_id, trackPromises: opts.trackPromises ?? true };
  const grades = gradeLiveChat(project.id, exchanges, meta).finally(() => { alertMissingReplies(project.id).catch(() => 0); watchSoon(project.id); });
  if (!opts.wait) grades.catch((err) => console.error("[live] grading failed:", err));
  return { exchanges, grades };
}
