import { all, get, run, transaction } from "../db";
import { buildKbIndex, featureVector, signalsFor, type KbIndex } from "../judge/features";
import { bestSentence, diagnose } from "../judge/evidence";
import { recordTrace } from "../traces";
import { heuristicGrade } from "../judge/heuristic";
import { aiForProject, JudgeError, judgeConcurrency, judgeLabel, llmGradeConversation } from "../judge/llm";
import { exchangesOf, VERDICT_LABELS, type Conversation, type Exchange, type Grade, type KbDoc, type Severity, type Verdict } from "../judge/types";
import type { MlpModel } from "../ml/mlp";
import { loadModel, riskScore } from "../ml/risk";
import { applyRules, parseMustInclude, projectRules, type Rule } from "../rules";
import { certaintySeverity, statedAsFact } from "../judge/certainty";
import { conversationFindings, FLAG_SEVERITY, INFO_FLAGS, isSafetyFlag, type ConvFlag } from "../judge/conversation";
import { isFrustrated } from "../sentiment";
import { topicFor } from "../topics";
import { trackReply } from "../promises";
import { raiseIncident } from "../incidents";

const SEVERITY_WEIGHT: Record<Severity, number> = { none: 0, low: 0.3, medium: 0.6, high: 1 };

export function scoreFromSeverities(severities: Severity[]): number {
  if (severities.length === 0) return 100;
  const penalty = severities.reduce((s, sev) => s + SEVERITY_WEIGHT[sev], 0);
  return Math.round((1 - penalty / severities.length) * 1000) / 10;
}

/** Title of the virtual article that carries the business's must-say statements. */
export const RULES_DOC_TITLE = "Required statements (from your rules)";

/**
 * The project's help articles, plus one virtual article with the statements its must-say rules require.
 * Without it, an answer that correctly follows a rule ("Prices include VAT") would be marked "not in docs"
 * whenever the articles don't mention it, so following your own rule would cost accuracy points.
 */
export function kbDocs(projectId: number): KbDoc[] {
  const docs = all<KbDoc>("SELECT title, content FROM kb_docs WHERE project_id = ? ORDER BY id", projectId);
  const required = projectRules(projectId)
    .filter((r) => r.kind === "must_include")
    .map((r) => parseMustInclude(r.pattern))
    .filter((r): r is { topic: string; required: string } => r !== null);
  if (!required.length) return docs;
  return [...docs, {
    title: RULES_DOC_TITLE,
    content: `The business requires its chatbot to include these statements. They are accurate, approved company information:\n${required.map((r) => `- When ${r.topic} comes up: "${r.required}"`).join("\n")}`,
  }];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export function createAudit(projectId: number, name: string): { id: number; mode: "ai" | "basic" } {
  const mode = aiForProject(projectId) ? "ai" : "basic";
  const { lastInsertRowid } = run("INSERT INTO audits (project_id, name, mode, status, judge) VALUES (?, ?, ?, 'running', ?)", projectId, name, mode, judgeLabel(projectId));
  return { id: lastInsertRowid, mode };
}

export const NOT_STORED = "(not stored: this project keeps results only)";

/**
 * Stores one graded answer: applies the business's custom rules, flags frustrated customers,
 * computes the neural risk score. Shared by uploaded audits and live tracking. Returns the final grade.
 */
const SEV_RANK: Record<Severity, number> = { none: 0, low: 1, medium: 2, high: 3 };

/** Adds conversation-level problems (re-asking, restarts, fallbacks, contradictions) to a grade. */
export function withConversationChecks(e: Exchange, grade: Grade): { grade: Grade; flags: ConvFlag[] } {
  const all = conversationFindings(e);
  if (!all.length) return { grade, flags: [] };
  // Informational flags (an attack the bot refused) are recorded but don't count against the bot.
  const findings = all.filter((f) => !INFO_FLAGS.includes(f.flag));
  if (!findings.length) return { grade, flags: all.map((f) => f.flag) };
  let severity = grade.severity;
  for (const f of findings) if (SEV_RANK[FLAG_SEVERITY[f.flag]] > SEV_RANK[severity]) severity = FLAG_SEVERITY[f.flag];
  const worst = findings.reduce((a, b) => (SEV_RANK[FLAG_SEVERITY[b.flag]] > SEV_RANK[FLAG_SEVERITY[a.flag]] ? b : a));
  const reason = grade.verdict === "correct" ? findings.map((f) => f.reason).join(" ") : `${grade.reason} Also: ${findings.map((f) => f.reason).join(" ")}`;
  const serious = SEV_RANK[FLAG_SEVERITY[worst.flag]] >= 2;
  return {
    grade: {
      ...grade,
      // A factually fine answer that re-asks, restarts or contradicts is still a problem the owner should see;
      // a safety problem (leak, injection, rude reply) breaks policy.
      verdict: isSafetyFlag(worst.flag) && FLAG_SEVERITY[worst.flag] === "high" && (grade.verdict === "correct" || grade.verdict === "unclear") ? "off_policy"
        : grade.verdict === "correct" && serious ? "unclear" : grade.verdict,
      severity,
      reason,
    },
    flags: all.map((f) => f.flag),
  };
}

/** Flags a wrong answer the bot stated as plain fact, and raises its risk (see judge/certainty). */
export function withCertaintyCheck(e: Exchange, grade: Grade, flags: ConvFlag[]): { grade: Grade; flags: ConvFlag[] } {
  const f = statedAsFact(e.answer, grade.verdict);
  if (!f) return { grade, flags };
  return { grade: { ...grade, severity: certaintySeverity(grade.severity, f), reason: `${grade.reason} ${f.reason}` }, flags: [...flags, "confident_wrong"] };
}

export function storeGradedItem(auditId: number, e: Exchange, g: Grade, index: KbIndex, model: MlpModel | null, rules: Rule[], note = "", meta: ReplyMeta = {}): Grade {
  const ruled = applyRules(e, g, rules);
  const hit = ruled.hit;
  const checked = ruled.hit ? { grade: ruled.grade, flags: conversationFindings(e).map((f) => f.flag) } : withConversationChecks(e, ruled.grade);
  const { grade, flags } = withCertaintyCheck(e, checked.grade, checked.flags);
  const features = featureVector(signalsFor(e, index), grade.verdict, grade.confidence);
  // "Don't store transcripts" mode: keep the verdict, reason and scores, but not the chat text itself.
  const frustrated = isFrustrated(e.question) ? 1 : 0;
  const topic = topicFor(e.question, grade.sourceDoc, g.topic);
  // Evidence comes from the business's own docs (never from the customer), so it is kept even in results-only mode.
  const evidence = grade.evidence ?? (grade.sourceDoc ? bestSentence(index.docs.find((d) => d.title === grade.sourceDoc), e.question, e.answer, grade.reason) : null);
  const diagnosis = diagnose(grade.verdict, evidence, meta.retrieved);
  const storeText = get<{ s: number }>("SELECT p.store_text AS s FROM audits a JOIN projects p ON p.id = a.project_id WHERE a.id = ?", auditId)?.s ?? 1;
  const originalAnswer = e.answer;
  if (!storeText) e = { ...e, question: NOT_STORED, answer: NOT_STORED };
  run(
    `INSERT INTO audit_items (audit_id, conversation_id, turn_index, question, answer, verdict, severity, reason, source_doc, confidence, features_json, risk, created_at, frustrated, rule_hit,
       conv_flags, latency_ms, cost_usd, bot_error, topic, evidence, diagnosis, trace_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    auditId, e.conversationId, e.turnIndex, e.question, e.answer, grade.verdict, grade.severity, grade.reason + note, grade.sourceDoc,
    grade.confidence, JSON.stringify(features), riskScore(model, features, grade.verdict, grade.confidence),
    frustrated, hit, flags.length ? flags.join(",") : null,
    meta.latencyMs ?? null, meta.costUsd ?? null, meta.error ?? null, topic, evidence, diagnosis, meta.traceId ?? null,
  );
  // Live conversations: track promised follow-ups until a task exists or the bot follows up (see lib/promises.ts).
  const live = get<{ project_id: number; store_text: number }>(
    "SELECT a.project_id, p.store_text FROM audits a JOIN projects p ON p.id = a.project_id WHERE a.id = ? AND a.status = 'live'", auditId,
  );
  if (live && meta.trackPromises !== false) trackReply(live.project_id, e.conversationId, originalAnswer, { taskId: meta.taskId, storeText: Boolean(live.store_text) });
  if (meta.traceId) {
    const projectId = get<{ p: number }>("SELECT project_id AS p FROM audits WHERE id = ?", auditId)?.p;
    if (projectId) recordTrace(projectId, meta.traceId, "chatbot", grade.verdict === "correct", `Chatbot reply: ${VERDICT_LABELS[grade.verdict]}`, grade.reason);
  }
  return { ...grade, evidence, diagnosis };
}

/** Operational data a bot can send with a reply (live tracking). */
export interface ReplyMeta { latencyMs?: number; costUsd?: number; error?: string; retrieved?: string[]; traceId?: string; taskId?: string; trackPromises?: boolean }

/** Grades every chatbot reply in the conversations and stores the results. Never throws; failures are stored on the audit. */
export async function executeAudit(auditId: number, projectId: number, conversations: Conversation[]): Promise<void> {
  try {
    const audit = get<{ mode: string }>("SELECT mode FROM audits WHERE id = ?", auditId);
    if (!audit) return;
    const docs = kbDocs(projectId);
    const index = buildKbIndex(docs);
    const model = loadModel(projectId);
    const rules = projectRules(projectId);

    const graded = await mapLimit(conversations, audit.mode === "ai" ? judgeConcurrency() : 8, async (conv) => {
      const exchanges = exchangesOf(conv);
      const grades: Grade[] =
        audit.mode === "ai" ? await llmGradeConversation(exchanges, docs, { projectId, kind: "audit" }) : exchanges.map((e) => heuristicGrade(e, index));
      return exchanges.map((e, i) => ({ e, g: grades[i] }));
    });

    const severities: Severity[] = [];
    transaction(() => {
      for (const { e, g } of graded.flat()) {
        severities.push(storeGradedItem(auditId, e, g, index, model, rules).severity);
      }
      run("UPDATE audits SET status = 'done', score = ? WHERE id = ?", scoreFromSeverities(severities), auditId);
    });

    const high = severities.filter((s) => s === "high").length;
    if (high > 0) {
      await raiseIncident(projectId, {
        module: "chatbot", code: "HIGH_SEVERITY_ANSWERS", severity: "high",
        title: `${high} high-risk chatbot answer${high > 1 ? "s" : ""} found`,
        detail: `Audit #${auditId} found ${high} answer${high === 1 ? "" : "s"} that could cost money, customers or create legal exposure.`,
        dedupeKey: `audit:${auditId}`,
      });
    }
  } catch (err) {
    const message = err instanceof JudgeError || err instanceof Error ? err.message : "Unknown error";
    run("UPDATE audits SET status = 'failed', error = ? WHERE id = ?", message, auditId);
  }
}

export interface FixGroup {
  doc: string;
  count: number;
  high: number;
  verdicts: Partial<Record<Verdict, number>>;
  examples: { question: string; answer: string; reason: string }[];
}

/** Groups problem answers by the help article that should be fixed or written. */
const BEHAVIOUR_FIX: Record<ConvFlag, string> = {
  re_ask: "Bot memory: asks again for details the customer already gave",
  restart: "Bot session handling: restarts mid-conversation",
  fallback: "Bot coverage: generic fallback replies instead of answers",
  contradiction: "Bot consistency: contradicts its earlier replies",
  confident_wrong: "Bot tone: wrong answers stated as fact",
  promise: "Bot follow-ups: promises of later action need a task behind them",
  injection: "Bot security: add prompt-injection protection to the system prompt",
  attack_blocked: "Bot security: attacks the bot refused (no action needed)",
  prompt_leak: "Bot security: stop the bot revealing its system prompt",
  data_leak: "Bot privacy: the bot exposed payment data",
  toxic: "Bot tone: rude or offensive replies",
  wrong_language: "Bot language: reply in the customer's language",
  no_ai_disclosure: "Bot transparency: say it's an AI (EU AI Act, Article 50)",
  account_change: "Bot security: never change login details in chat without verifying identity",
};

/** Headline risk numbers for reports ("3 answers could have created legal or financial exposure"). */
export function riskSummary(auditId: number): { high: number; medium: number; flags: Record<ConvFlag, number>; statedAsFact: number } {
  const bySev = all<{ severity: Severity; n: number }>(
    "SELECT severity, COUNT(*) AS n FROM audit_items WHERE audit_id = ? AND COALESCE(corrected_verdict, verdict) <> 'correct' GROUP BY severity", auditId,
  );
  const flags = { re_ask: 0, restart: 0, fallback: 0, contradiction: 0, injection: 0, attack_blocked: 0, prompt_leak: 0, data_leak: 0, toxic: 0, wrong_language: 0, no_ai_disclosure: 0, account_change: 0 } as Record<ConvFlag, number>;
  for (const r of all<{ conv_flags: string }>("SELECT conv_flags FROM audit_items WHERE audit_id = ? AND conv_flags IS NOT NULL", auditId)) {
    for (const f of r.conv_flags.split(",") as ConvFlag[]) if (f in flags) flags[f]++;
  }
  // "Stated as fact" describes how a wrong answer was said, so it is counted on its own, not as a conversation problem.
  const statedAsFact = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM audit_items WHERE audit_id = ? AND (',' || conv_flags || ',') LIKE '%,confident_wrong,%' AND COALESCE(corrected_verdict, verdict) <> 'correct'", auditId,
  )?.n ?? 0;
  return { high: bySev.find((s) => s.severity === "high")?.n ?? 0, medium: bySev.find((s) => s.severity === "medium")?.n ?? 0, flags, statedAsFact };
}

export function fixList(auditId: number): FixGroup[] {
  const rows = all<{ source_doc: string | null; verdict: Verdict; severity: Severity; question: string; answer: string; reason: string; rule_hit: string | null; conv_flags: string | null }>(
    `SELECT source_doc, COALESCE(corrected_verdict, verdict) AS verdict, severity, question, answer, reason, rule_hit, conv_flags
       FROM audit_items WHERE audit_id = ? AND COALESCE(corrected_verdict, verdict) <> 'correct'
      ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
    auditId,
  );
  const groups = new Map<string, FixGroup>();
  for (const r of rows) {
    // Problems caused by the bot's behaviour are fixed in its prompt, code or hand-over logic, not in a help article.
    const flag = r.conv_flags?.split(",").find((f) => !INFO_FLAGS.includes(f as ConvFlag)) as ConvFlag | undefined;
    const doc = r.rule_hit ? `Bot prompt/logic: rule "${r.rule_hit.split("\n")[0].split(":").slice(1).join(":")}" broken`
      : flag && (!r.source_doc || isSafetyFlag(flag)) ? BEHAVIOUR_FIX[flag]
      : r.verdict === "should_escalate" && !r.source_doc ? "Bot hand-over logic: escalate these cases to a human"
      : r.source_doc ?? "Missing documentation (write a new article)";
    const g = groups.get(doc) ?? { doc, count: 0, high: 0, verdicts: {}, examples: [] };
    g.count++;
    if (r.severity === "high") g.high++;
    g.verdicts[r.verdict] = (g.verdicts[r.verdict] ?? 0) + 1;
    if (g.examples.length < 8) g.examples.push({ question: r.question, answer: r.answer, reason: r.reason });
    groups.set(doc, g);
  }
  return [...groups.values()].sort((a, b) => b.high - a.high || b.count - a.count);
}
