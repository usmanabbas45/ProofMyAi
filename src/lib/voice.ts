import { processLiveChat } from "./audit/live";
import { get, run } from "./db";
import { raiseIncident } from "./incidents";
import type { Project } from "./projects";

/**
 * Voice bots (phone AI): a finished call's transcript, from Vapi, Retell or any provider. Every bot answer is
 * checked like a chat reply, and the call itself is checked for the failure staff testing misses: the caller
 * asked for a person and the call ended without a transfer (or the transfer the bot promised never happened).
 */

export interface Call {
  provider: "vapi" | "retell" | "generic";
  id: string;
  botName: string | null;
  turns: { role: "user" | "assistant"; content: string }[];
  /** true / false when the provider says how the call ended; null when unknown. */
  transferred: boolean | null;
  endedReason: string | null;
  durationS: number | null;
}

export type ParsedCall = { ok: true; call: Call } | { ok: true; ignored: string } | { ok: false; error: string };

const USER_ROLES = /^(user|customer|caller|human|client)$/i;
const BOT_ROLES = /^(assistant|bot|agent|ai|model)$/i;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function turnsFrom(list: unknown): Call["turns"] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((m): Call["turns"] => {
    const o = obj(m);
    const role = str(o.role);
    const content = (str(o.content) || str(o.message) || str(o.text)).trim();
    if (!content) return [];
    if (USER_ROLES.test(role)) return [{ role: "user" as const, content }];
    if (BOT_ROLES.test(role)) return [{ role: "assistant" as const, content }];
    return [];
  });
}

/** "AI: Hello\nUser: Hi" style transcripts. */
export function turnsFromText(text: string): Call["turns"] {
  const out: Call["turns"] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(ai|bot|assistant|agent|user|customer|caller|human)\s*:\s*(.+)$/i);
    if (m) out.push({ role: USER_ROLES.test(m[1]) ? "user" : "assistant", content: m[2].trim() });
    else if (out.length && line.trim()) out[out.length - 1].content += ` ${line.trim()}`;
  }
  return out;
}

const transferReason = (r: string | null) => (r ? /transfer|forward/i.test(r) : null);

/** Recognises Vapi end-of-call reports, Retell call webhooks and the generic format. */
export function parseCall(body: unknown): ParsedCall {
  const b = obj(body);
  const msg = obj(b.message);
  if (str(msg.type)) {
    // Vapi server message: only the end-of-call report carries the whole call.
    if (msg.type !== "end-of-call-report") return { ok: true, ignored: `Vapi "${msg.type}" message ignored; only end-of-call-report is used.` };
    const call = obj(msg.call);
    const artifact = obj(msg.artifact);
    let turns = turnsFrom(artifact.messages ?? msg.messages);
    if (!turns.length) turns = turnsFromText(str(artifact.transcript) || str(msg.transcript));
    const endedReason = str(msg.endedReason) || null;
    return { ok: true, call: { provider: "vapi", id: str(call.id) || str(msg.callId) || `vapi-${Date.now()}`, botName: str(obj(msg.assistant).name) || str(obj(call.assistant).name) || null,
      turns, transferred: transferReason(endedReason), endedReason, durationS: typeof msg.durationSeconds === "number" ? msg.durationSeconds : null } };
  }
  if (str(b.event)) {
    // Retell: call_started / call_ended / call_analyzed. Use call_ended (call_analyzed repeats it).
    if (b.event !== "call_ended") return { ok: true, ignored: `Retell "${b.event}" event ignored; only call_ended is used.` };
    const call = obj(b.call);
    let turns = turnsFrom(call.transcript_object);
    if (!turns.length) turns = turnsFromText(str(call.transcript));
    const endedReason = str(call.disconnection_reason) || null;
    const start = Number(call.start_timestamp), end = Number(call.end_timestamp);
    return { ok: true, call: { provider: "retell", id: str(call.call_id) || `retell-${Date.now()}`, botName: str(call.agent_name) || str(call.agent_id) || null,
      turns, transferred: transferReason(endedReason), endedReason, durationS: start && end ? (end - start) / 1000 : null } };
  }
  // Generic: { call_id, transcript: [{role, content}] | "AI: …\nUser: …", transferred?, ended_reason?, duration_seconds?, bot_name? }
  const id = str(b.call_id) || str(b.id);
  if (!id) return { ok: false, error: "call_id: required (or send a Vapi end-of-call-report or a Retell call_ended webhook)" };
  const turns = Array.isArray(b.transcript) ? turnsFrom(b.transcript) : Array.isArray(b.messages) ? turnsFrom(b.messages) : turnsFromText(str(b.transcript));
  const endedReason = str(b.ended_reason) || null;
  return { ok: true, call: { provider: "generic", id, botName: str(b.bot_name) || null, turns,
    transferred: typeof b.transferred === "boolean" ? b.transferred : transferReason(endedReason), endedReason,
    durationS: typeof b.duration_seconds === "number" ? b.duration_seconds : null } };
}

// The caller asks for a person ("can I speak to someone", "operator", "transfer me").
export const HUMAN_REQUEST = /\b((speak|talk)\s+(to|with)\s+(a |an |the |someone |somebody |a real |a live )?(real |live )?(human|person|someone|somebody|operator|representative|rep|agent|manager|staff|receptionist|member of staff)|transfer me|put me through|connect me (to|with)|(get|give) me (a |an )?(real |live )?(human|person|operator|representative|agent)|(human|operator|representative|receptionist),? please|\boperator\b)/i;
// The bot says it is transferring the caller.
const TRANSFER_SAID = /\b(transferring you|transfer you|connecting you|connect you|put(ting)? you through|forward(ing)? (you|your call))\b/i;

export interface CallIssue { code: "CALL_NOT_TRANSFERRED" | "TRANSFER_NOT_OFFERED"; severity: "high" | "medium"; message: string }

export function checkCall(call: Call): { humanRequested: boolean; asks: number; issues: CallIssue[] } {
  const asks = call.turns.filter((t) => t.role === "user" && HUMAN_REQUEST.test(t.content)).length;
  const issues: CallIssue[] = [];
  if (!asks) return { humanRequested: false, asks, issues };
  const firstAsk = call.turns.findIndex((t) => t.role === "user" && HUMAN_REQUEST.test(t.content));
  const promised = call.turns.slice(firstAsk + 1).some((t) => t.role === "assistant" && TRANSFER_SAID.test(t.content));
  const times = asks > 1 ? ` (asked ${asks} times)` : "";
  if (call.transferred === false) {
    issues.push({ code: "CALL_NOT_TRANSFERRED", severity: "high",
      message: promised
        ? `The caller asked for a person${times} and the bot said it was transferring them, but the call ended without a transfer${call.endedReason ? ` ("${call.endedReason}")` : ""}. Check the transfer number and the transfer tool.`
        : `The caller asked for a person${times} and the call ended without a transfer${call.endedReason ? ` ("${call.endedReason}")` : ""}. The bot never offered one.` });
  } else if (call.transferred === null && !promised) {
    issues.push({ code: "TRANSFER_NOT_OFFERED", severity: "medium", message: `The caller asked for a person${times}, and the bot never offered to transfer them.` });
  }
  return { humanRequested: true, asks, issues };
}

export async function ingestCall(project: Project, call: Call): Promise<{ duplicate: boolean; graded: number; issues: CallIssue[] }> {
  if (get("SELECT 1 FROM voice_calls WHERE project_id = ? AND external_id = ?", project.id, call.id)) return { duplicate: true, graded: 0, issues: [] };
  const { humanRequested, issues } = checkCall(call);
  run(
    `INSERT INTO voice_calls (project_id, external_id, provider, bot_name, turns, duration_s, ended_reason, human_requested, transferred, issues_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    project.id, call.id, call.provider, call.botName, call.turns.length, call.durationS, call.endedReason, humanRequested ? 1 : 0, call.transferred ? 1 : 0, JSON.stringify(issues),
  );
  const bot = `Voice${call.botName ? `: ${call.botName}` : ""}`;
  for (const i of issues) {
    await raiseIncident(project.id, {
      module: "chatbot", code: i.code, severity: i.severity,
      title: i.code === "CALL_NOT_TRANSFERRED" ? `${bot}: a caller who asked for a person wasn't transferred` : `${bot}: a caller asked for a person and wasn't offered one`,
      detail: `Call ${call.id}: ${i.message}`,
      dedupeKey: `call:${call.id}`,
    });
  }
  // Each bot answer is checked like a chat reply. A call ends with the caller hanging up, so trailing caller
  // lines aren't "unanswered messages".
  const turns = [...call.turns];
  while (turns.length && turns[turns.length - 1].role === "user") turns.pop();
  let graded = 0;
  if (turns.some((t) => t.role === "assistant") && turns.some((t) => t.role === "user")) {
    const r = await processLiveChat(project, { conversation_id: `call:${call.id}`, bot_name: bot.slice(0, 100), messages: turns.slice(-300) }, { wait: true });
    graded = (await r.grades).length;
  }
  return { duplicate: false, graded, issues };
}
