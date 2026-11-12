import { checkAgentRun, type AgentRun } from "./agents/checks";
import { kbDocs } from "./audit/run";
import { all, get, run } from "./db";
import { sendMail } from "./email";
import { compose } from "./emails";
import { raiseIncident } from "./incidents";
import { statedAsFact } from "./judge/certainty";
import { buildKbIndex } from "./judge/features";
import { heuristicGrade } from "./judge/heuristic";
import { CHANNEL_TYPES, channelsFor, deliver, type AlertMessage } from "./notify";
import { decisionFor } from "./trust";

/**
 * "A control that has never failed has not been proven to work." Monthly (and on demand), ProofMyAI feeds its
 * own checks a known-bad case and confirms each one fires: a made-up chatbot answer must be caught and blocked,
 * a looping, destructive, empty agent run must be flagged, and a test message must reach every alert channel.
 * Uses the rule-based checks, so a self-test costs nothing and stores no customer data.
 */

export type SelfTestId = "answers" | "presend" | "agents" | "alerts";
export interface SelfTestResult { id: SelfTestId; name: string; status: "pass" | "fail" | "skip"; detail: string }
export interface SelfTest { ok: boolean; results: SelfTestResult[]; at: string; trigger: string }

const MONTH_MS = 30 * 86400000;

/** Two numbers that appear nowhere in the help articles, so an answer using them is certainly made up. */
function unknownNumbers(known: Set<string>): [string, string] {
  const pick = (start: number) => { let n = start; while (known.has(String(n))) n += 7; return String(n); };
  return [pick(987), pick(41)];
}

function checkAnswers(projectId: number): SelfTestResult[] {
  const docs = kbDocs(projectId);
  if (!docs.length) {
    const skip = "Add help articles in Chatbot audits first: answers are checked against them.";
    return [{ id: "answers", name: "Made-up chatbot answers are caught", status: "skip", detail: skip },
      { id: "presend", name: "Pre-send check blocks a made-up answer", status: "skip", detail: skip }];
  }
  const index = buildKbIndex(docs);
  const [price, days] = unknownNumbers(index.numbers);
  const topic = docs[0].title;
  const ex = { conversationId: "self-test", turnIndex: 0, question: `${topic}?`, answer: `Yes, definitely. It costs £${price} and always arrives within ${days} days.` };
  const g = heuristicGrade(ex, index);
  const caught = g.verdict !== "correct";
  const fact = caught ? statedAsFact(ex.answer, g.verdict) : null;
  const decision = decisionFor(g.verdict, g.severity);
  return [
    { id: "answers", name: "Made-up chatbot answers are caught", status: caught ? "pass" : "fail",
      detail: caught ? `A fake answer about "${topic}" (£${price}, ${days} days) was marked ${g.verdict.replace("_", " ")}${fact ? " and stated as fact" : ""}.`
        : `A fake answer about "${topic}" with prices your articles never mention was marked correct. Check your help articles aren't empty or generic.` },
    { id: "presend", name: "Pre-send check blocks a made-up answer", status: decision === "allow" ? "fail" : "pass",
      detail: decision === "allow" ? "The same fake answer would have been allowed through." : `The same fake answer would have been ${decision === "block" ? "blocked" : "held for review"}.` },
  ];
}

const BAD_RUN: AgentRun = {
  run_id: "self-test", agent_name: "Self-test agent", goal: "Clean up duplicate orders", status: "success", final_output: "",
  steps: [
    ...[1, 2, 3].map(() => ({ type: "tool" as const, name: "get_order", input: { id: 7 }, output: null, error: null, duration_ms: 10, tokens: 0, cost_usd: 0 })),
    { type: "tool" as const, name: "run_sql", input: { query: "DROP TABLE orders", env: "production" }, output: null, error: null, duration_ms: 10, tokens: 0, cost_usd: 0 },
  ],
};

function checkAgents(): SelfTestResult {
  const codes = checkAgentRun(BAD_RUN, { costBudgetUsd: 1, maxSteps: 50, maxMs: 120000 }).map((i) => i.code);
  const want = ["LOOP_DETECTED", "DESTRUCTIVE_ACTION", "EMPTY_OUTPUT"];
  const missed = want.filter((c) => !codes.includes(c));
  return { id: "agents", name: "Risky AI agent runs are flagged", status: missed.length ? "fail" : "pass",
    detail: missed.length ? `A test run with a loop, a production DROP TABLE and no output wasn't flagged for: ${missed.join(", ")}.` : "A test run with a loop, a production DROP TABLE and an empty result was flagged for all three." };
}

async function checkAlerts(projectId: number, send: boolean, fetcher?: Parameters<typeof deliver>[2]): Promise<SelfTestResult> {
  const name = "Alerts reach you";
  const project = get<{ name: string }>("SELECT name FROM projects WHERE id = ?", projectId);
  const channels = channelsFor(projectId).filter((c) => c.enabled !== 0 && !c.verify_hash);
  if (!channels.length) return { id: "alerts", name, status: "fail", detail: "No alert channel is switched on, so nobody would be told when something breaks. Add one on the Alerts page." };
  if (!send) return { id: "alerts", name, status: "skip", detail: `${channels.length} channel${channels.length === 1 ? "" : "s"} set up; no test message sent this time.` };
  const msg: AlertMessage = {
    projectId, projectName: project?.name ?? "", kind: "problem", module: "workflows", code: "TEST_ALERT", severity: "high",
    title: "Self-test: your alerts work", detail: "ProofMyAI's monthly self-test. No action needed: if you can read this, alerts reach you.",
    link: `${process.env.APP_URL ?? ""}/app/p/${projectId}/checks`,
  };
  const results = await Promise.allSettled(channels.map((c) => deliver(c, msg, fetcher)));
  const failed: string[] = [];
  results.forEach((r, i) => {
    const status = r.status === "fulfilled" ? "ok" : String(r.reason instanceof Error ? r.reason.message : r.reason).slice(0, 200);
    if (r.status === "rejected") failed.push(`${CHANNEL_TYPES[channels[i].type].label}: ${status}`);
    run("UPDATE alert_channels SET last_status = ?, last_sent_at = ? WHERE id = ?", status, new Date().toISOString(), channels[i].id);
  });
  return { id: "alerts", name, status: failed.length ? "fail" : "pass",
    detail: failed.length ? `Test message failed on ${failed.join(" · ")}` : `Test message delivered to ${channels.length} channel${channels.length === 1 ? "" : "s"}.` };
}

export async function runSelfTest(projectId: number, trigger: "manual" | "monthly", opts: { sendAlert?: boolean; fetcher?: Parameters<typeof deliver>[2] } = {}): Promise<SelfTest> {
  const results = [...checkAnswers(projectId), checkAgents(), await checkAlerts(projectId, opts.sendAlert ?? true, opts.fetcher)];
  const ok = results.every((r) => r.status !== "fail");
  const at = new Date().toISOString();
  run("INSERT INTO self_tests (project_id, trigger, ok, results_json, created_at) VALUES (?, ?, ?, ?, ?)", projectId, trigger, ok ? 1 : 0, JSON.stringify(results), at);
  if (!ok) {
    const failed = results.filter((r) => r.status === "fail");
    const title = `Self-test failed: ${failed.map((r) => r.name.toLowerCase()).join("; ")}`;
    const detail = failed.map((r) => r.detail).join(" ");
    await raiseIncident(projectId, { module: "workflows", code: "SELF_TEST_FAILED", severity: "high", title, detail, dedupeKey: `selftest:${at.slice(0, 10)}` });
    // If alerts themselves are broken, the incident can't reach anyone: email the owner directly.
    if (failed.some((r) => r.id === "alerts")) {
      const owner = get<{ email: string; name: string }>("SELECT u.email, p.name FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?", projectId);
      if (owner) {
        await sendMail(owner.email, compose(`Your ProofMyAI alerts aren't reaching you · ${owner.name}`, detail, {
          icon: "🚨", title: "Your alerts aren't reaching you",
          paragraphs: [`ProofMyAI's self-test for "${owner.name}" found a problem: ${failed.find((r) => r.id === "alerts")!.detail}`, "Until this is fixed, you won't hear about broken chatbots, agents or workflows."],
          cta: { label: "Fix alerts", url: `${process.env.APP_URL ?? ""}/app/p/${projectId}/alerts` },
        })).catch(() => false);
      }
    }
  }
  return { ok, results, at, trigger };
}

export function lastSelfTest(projectId: number): SelfTest | null {
  const r = get<{ ok: number; results_json: string; created_at: string; trigger: string }>(
    "SELECT ok, results_json, created_at, trigger FROM self_tests WHERE project_id = ? ORDER BY id DESC LIMIT 1", projectId,
  );
  return r ? { ok: Boolean(r.ok), results: JSON.parse(r.results_json), at: r.created_at, trigger: r.trigger } : null;
}

/** Monthly self-test for every live project that is set up enough to test (has an alert channel or recent data). */
export async function runDueSelfTests(now = Date.now()): Promise<number> {
  const projects = all<{ id: number }>(
    `SELECT p.id FROM projects p WHERE p.is_demo = 0 AND (
       EXISTS (SELECT 1 FROM alert_channels c WHERE c.project_id = p.id)
       OR EXISTS (SELECT 1 FROM incidents i WHERE i.project_id = p.id AND i.created_at >= datetime('now', '-30 days')))`,
  );
  let ran = 0;
  for (const p of projects) {
    const last = lastSelfTest(p.id);
    if (last && now - Date.parse(last.at) < MONTH_MS) continue;
    await runSelfTest(p.id, "monthly");
    ran++;
  }
  return ran;
}

// ---------- "Has this check ever fired?" ----------

export interface CheckHealth { name: string; connected: boolean; lastFired: string | null; fired30: number; what: string }

const sqlNow = (days: number) => new Date(Date.now() - days * 86400000).toISOString().replace("T", " ").slice(0, 19);

/** When each check last caught something. A check that is connected but has never fired is unproven. */
export function checkHealth(projectId: number): CheckHealth[] {
  const since = sqlNow(30);
  const one = (sql: string, ...args: (string | number | null)[]) => get<{ last: string | null; n: number; c: number }>(sql, projectId, ...args) ?? { last: null, n: 0, c: 0 };
  const inc = (where: string, connected: string) => one(
    `SELECT (SELECT MAX(created_at) FROM incidents WHERE project_id = ?1 AND ${where}) AS last,
            (SELECT COUNT(*) FROM incidents WHERE project_id = ?1 AND ${where} AND replace(created_at, 'T', ' ') >= ?2) AS n,
            (${connected}) AS c`, since,
  );
  const rows: [string, string, { last: string | null; n: number; c: number }][] = [
    ["Chatbot answer checks", "made-up, off-policy or unsupported answers", one(
      `SELECT (SELECT MAX(i.created_at) FROM audit_items i JOIN audits a ON a.id = i.audit_id WHERE a.project_id = ?1 AND COALESCE(i.corrected_verdict, i.verdict) <> 'correct') AS last,
              (SELECT COUNT(*) FROM audit_items i JOIN audits a ON a.id = i.audit_id WHERE a.project_id = ?1 AND COALESCE(i.corrected_verdict, i.verdict) <> 'correct' AND replace(i.created_at, 'T', ' ') >= ?2) AS n,
              (SELECT COUNT(*) FROM audits WHERE project_id = ?1) AS c`, since)],
    ["Pre-send check", "replies blocked or held before sending", one(
      `SELECT (SELECT MAX(created_at) FROM presend_checks WHERE project_id = ?1 AND decision <> 'allow') AS last,
              (SELECT COUNT(*) FROM presend_checks WHERE project_id = ?1 AND decision <> 'allow' AND replace(created_at, 'T', ' ') >= ?2) AS n,
              (SELECT COUNT(*) FROM presend_checks WHERE project_id = ?1) AS c`, since)],
    ["Approvals", "risky actions held for a person", one(
      `SELECT (SELECT MAX(created_at) FROM approvals WHERE project_id = ?1 AND auto = 0) AS last,
              (SELECT COUNT(*) FROM approvals WHERE project_id = ?1 AND auto = 0 AND replace(created_at, 'T', ' ') >= ?2) AS n,
              (SELECT COUNT(*) FROM approvals WHERE project_id = ?1) AS c`, since)],
    ["AI agent checks", "loops, errors, destructive actions, agents gone quiet",
      inc("module = 'agents'", "SELECT COUNT(*) FROM agent_runs WHERE project_id = ?1")],
    ["n8n & Make", "failures, silent failures, stopped workflows",
      inc("module = 'workflows' AND code NOT LIKE 'CRM_%' AND code NOT LIKE 'SHEET_%' AND code NOT LIKE 'HEARTBEAT_%' AND code NOT IN ('SELF_TEST_FAILED', 'CALL_NOT_TRANSFERRED')", "SELECT COUNT(*) FROM workflow_runs WHERE project_id = ?1")],
    ["CRM", "missing leads, duplicates, bulk changes", inc("code LIKE 'CRM_%'", "SELECT COUNT(*) FROM crm_sources WHERE project_id = ?1")],
    ["Google Sheets", "broken cells, stale sheets", inc("code LIKE 'SHEET_%'", "SELECT COUNT(*) FROM sheet_watches WHERE project_id = ?1")],
    ["Heartbeats", "scheduled jobs that didn't check in", inc("code LIKE 'HEARTBEAT_%'", "SELECT COUNT(*) FROM job_heartbeats WHERE project_id = ?1")],
    ["Uptime", "downtime and slow responses", inc("module = 'uptime'", "SELECT COUNT(*) FROM uptime_monitors WHERE project_id = ?1")],
    ["Promised follow-ups", "\"I'll get back to you\" with no task or follow-up", inc("code LIKE 'PROMISE_%'", "SELECT COUNT(*) FROM promises WHERE project_id = ?1")],
    ["Voice calls", "callers who asked for a person and weren't transferred", inc("code = 'CALL_NOT_TRANSFERRED'", "SELECT COUNT(*) FROM voice_calls WHERE project_id = ?1")],
  ];
  return rows.map(([name, what, r]) => ({ name, what, connected: r.c > 0, lastFired: r.last, fired30: r.n }));
}
