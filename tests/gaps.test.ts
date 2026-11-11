import { beforeEach, describe, expect, it } from "vitest";
import { destructiveIssue, checkAgentRun, type AgentRun } from "@/lib/agents/checks";
import { stoppedAgentChecks, unfinishedAgentRuns } from "@/lib/agents/health";
import { ingestAgentRun } from "@/lib/agents/ingest";
import { all, get, run } from "@/lib/db";
import { safetyFindings } from "@/lib/judge/safety";
import { checkHealth, lastSelfTest, runDueSelfTests, runSelfTest } from "@/lib/selftest";
import { checkCall, ingestCall, parseCall, turnsFromText, type Call } from "@/lib/voice";
import type { Project } from "@/lib/projects";
import { freshDb } from "./helpers";

let projectId: number;
beforeEach(() => ({ projectId } = freshDb()));

const tool = (name: string, input?: unknown) => ({ type: "tool" as const, name, input, output: null, error: null, duration_ms: 10, tokens: 0, cost_usd: 0 });
const incidents = (code: string) => all<{ title: string; detail: string }>("SELECT title, detail FROM incidents WHERE project_id = ? AND code = ?", projectId, code);

describe("destructive agent actions", () => {
  it("flags deletes, drops and force pushes; high when they hit production, backups or everything", () => {
    expect(destructiveIssue([tool("volumeDelete", { volumeId: "vol_1", env: "production" })])).toMatchObject({ code: "DESTRUCTIVE_ACTION", severity: "high" });
    expect(destructiveIssue([tool("run_sql", { query: "DROP TABLE orders" })])).toMatchObject({ severity: "medium" });
    expect(destructiveIssue([tool("run_sql", { query: "DELETE FROM customers;" })])?.message).toContain("DELETE FROM customers");
    expect(destructiveIssue([tool("shell", "rm -rf /data/backups")])).toMatchObject({ severity: "high" });
    expect(destructiveIssue([tool("shell", "git push --force origin main")])).toMatchObject({ severity: "high" });
    expect(destructiveIssue([tool("graphql", { query: "mutation { volumeDelete(id: 1) }" })])).not.toBeNull();
    // The PocketOS case: one API call deleting a production volume (and its backups).
    expect(destructiveIssue([tool("railway_api", { query: 'mutation { volumeDelete(volumeId: "vol_prod") }' })])).toMatchObject({ severity: "high" });
  });

  it("leaves reads, filtered deletes and LLM steps alone", () => {
    expect(destructiveIssue([tool("get_order", { id: 1 }), tool("run_sql", { query: "DELETE FROM carts WHERE id = 4" }), tool("search_docs", { q: "how to delete an account" })])).toBeNull();
    expect(destructiveIssue([{ ...tool("delete_everything"), type: "llm" as const }])).toBeNull();
  });

  it("alerts on an unapproved destructive run, but only records one a person approved first", async () => {
    const r = (id: string, trace?: string): AgentRun => ({ run_id: id, agent_name: "ops", goal: "tidy", status: "success", final_output: "done", steps: [tool("dropDatabase", { db: "production" })], ...(trace ? { trace_id: trace } : {}) });
    expect(checkAgentRun(r("a"), { costBudgetUsd: 1, maxSteps: 50, maxMs: 1e6 }).map((i) => i.code)).toContain("DESTRUCTIVE_ACTION");
    await ingestAgentRun(projectId, r("a"));
    expect(incidents("DESTRUCTIVE_ACTION")).toHaveLength(1);
    run(`INSERT INTO approvals (project_id, fingerprint, action, summary, status, auto, reason, created_at, expires_at, trace_id)
         VALUES (?, 'f', 'db', 'Drop old db', 'approved', 0, 'ok', datetime('now'), datetime('now', '+1 day'), 't-1')`, projectId);
    const ok = await ingestAgentRun(projectId, r("b", "t-1"));
    expect(ok.ok && ok.issues.find((i) => i.code === "DESTRUCTIVE_ACTION")).toMatchObject({ severity: "low" });
  });
});

describe("agents that go quiet", () => {
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace("T", " ").slice(0, 19);

  it("learns the agent's rhythm and alerts once when it stops, then resolves when it runs again", async () => {
    for (let i = 0; i < 10; i++) run("INSERT INTO agent_runs (project_id, external_id, agent_name, goal, status, final_output, steps_json, total_cost_usd, total_ms, issues_json, score, created_at) VALUES (?, ?, 'lead-bot', '', 'success', 'x', '[]', 0, 1000, '[]', 100, ?)", projectId, `r${i}`, at((i + 30) * 3600000));
    expect(await stoppedAgentChecks(projectId)).toBe(1);
    expect(incidents("AGENT_STOPPED")[0].title).toBe('Agent "lead-bot" has gone quiet');
    expect(await stoppedAgentChecks(projectId)).toBe(0); // no repeat
    run("INSERT INTO agent_runs (project_id, external_id, agent_name, goal, status, final_output, steps_json, total_cost_usd, total_ms, issues_json, score, created_at) VALUES (?, 'new', 'lead-bot', '', 'success', 'x', '[]', 0, 1000, '[]', 100, ?)", projectId, at(60000));
    await stoppedAgentChecks(projectId);
    expect(get("SELECT resolved FROM incidents WHERE project_id = ? AND code = 'AGENT_STOPPED'", projectId)).toEqual({ resolved: 1 });
  });

  it("accepts a start, forgets it when the run finishes, and alerts on starts that never finish", async () => {
    expect(await ingestAgentRun(projectId, { run_id: "s1", agent_name: "ops", status: "running" })).toMatchObject({ ok: true, started: true });
    expect(await ingestAgentRun(projectId, { run_id: "s1", agent_name: "ops", status: "success", final_output: "ok" })).toMatchObject({ ok: true });
    expect(get("SELECT COUNT(*) AS n FROM agent_run_starts")).toEqual({ n: 0 });
    run("INSERT INTO agent_run_starts (project_id, external_id, agent_name, started_at) VALUES (?, 'hung', 'ops', ?)", projectId, new Date(Date.now() - 2 * 3600000).toISOString());
    run("INSERT INTO agent_run_starts (project_id, external_id, agent_name, started_at) VALUES (?, 'fresh', 'ops', ?)", projectId, new Date().toISOString());
    expect(await unfinishedAgentRuns(projectId)).toBe(1);
    expect(incidents("AGENT_RUN_UNFINISHED")[0]).toMatchObject({ title: 'Agent "ops": 1 run started but never finished' });
    expect(incidents("AGENT_RUN_UNFINISHED")[0].detail).toContain("hung");
    run("DELETE FROM agent_run_starts WHERE external_id = 'hung'");
    await unfinishedAgentRuns(projectId);
    expect(get("SELECT resolved FROM incidents WHERE code = 'AGENT_RUN_UNFINISHED'")).toEqual({ resolved: 1 });
  });
});

describe("self-test: proof the checks work", () => {
  it("passes with help articles and a working channel, and records the result", async () => {
    run("INSERT INTO kb_docs (project_id, title, content) VALUES (?, 'Delivery', 'Standard delivery costs £3.99 and takes 3-5 days.')", projectId);
    run("INSERT INTO alert_channels (project_id, type, target, min_severity) VALUES (?, 'slack', 'https://hooks.slack.com/a', 'high')", projectId);
    const sent: string[] = [];
    const fetcher = (async (url: string) => { sent.push(url); return new Response("ok"); }) as never;
    const r = await runSelfTest(projectId, "manual", { fetcher });
    expect(r.results.map((x) => [x.id, x.status])).toEqual([["answers", "pass"], ["presend", "pass"], ["agents", "pass"], ["alerts", "pass"]]);
    expect(r.ok).toBe(true);
    expect(sent).toEqual(["https://hooks.slack.com/a"]);
    expect(lastSelfTest(projectId)).toMatchObject({ ok: true, trigger: "manual" });
  });

  it("fails and raises an incident when no alert channel would tell anyone, and when delivery breaks", async () => {
    const r = await runSelfTest(projectId, "monthly");
    expect(r.ok).toBe(false);
    expect(r.results.find((x) => x.id === "answers")?.status).toBe("skip");
    expect(incidents("SELF_TEST_FAILED")[0].title).toContain("alerts reach you");
    run("INSERT INTO alert_channels (project_id, type, target, min_severity) VALUES (?, 'slack', 'https://hooks.slack.com/a', 'high')", projectId);
    const broken = (async () => new Response("no_service", { status: 404 })) as never;
    const r2 = await runSelfTest(projectId, "manual", { fetcher: broken });
    expect(r2.results.find((x) => x.id === "alerts")).toMatchObject({ status: "fail" });
    expect(r2.results.find((x) => x.id === "alerts")?.detail).toContain("HTTP 404");
  });

  it("runs monthly only for set-up projects that weren't tested in the last 30 days", async () => {
    expect(await runDueSelfTests()).toBe(0); // nothing set up
    run("INSERT INTO alert_channels (project_id, type, target, min_severity, enabled) VALUES (?, 'slack', 'https://hooks.slack.com/a', 'high', 0)", projectId);
    expect(await runDueSelfTests()).toBe(1);
    expect(await runDueSelfTests()).toBe(0);
  });

  it("shows when each check last fired, and which connected checks are unproven", () => {
    run("INSERT INTO uptime_monitors (project_id, url, name) VALUES (?, 'https://x.example', 'x')", projectId);
    run("INSERT INTO incidents (project_id, module, code, severity, title, detail) VALUES (?, 'workflows', 'CRM_DUPLICATES', 'medium', 't', 'd')", projectId);
    const h = Object.fromEntries(checkHealth(projectId).map((c) => [c.name, c]));
    expect(h.Uptime).toMatchObject({ connected: true, lastFired: null });
    expect(h.CRM).toMatchObject({ connected: false, fired30: 1 });
    expect(h["Chatbot answer checks"].connected).toBe(false);
  });
});

describe("voice bots", () => {
  const call = (over: Partial<Call>): Call => ({ provider: "generic", id: "c1", botName: "Front desk", transferred: null, endedReason: null, durationS: 60,
    turns: [{ role: "assistant", content: "Village offices, how can I help?" }, { role: "user", content: "Can I speak to someone in Parks and Recreation?" }, { role: "assistant", content: "Sure, transferring you now." }], ...over });

  it("parses Vapi end-of-call reports, Retell call_ended and the generic format; ignores other events", () => {
    const vapi = parseCall({ message: { type: "end-of-call-report", endedReason: "customer-ended-call", call: { id: "v1" }, assistant: { name: "Reception" },
      artifact: { messages: [{ role: "system", message: "x" }, { role: "bot", message: "Hi" }, { role: "user", message: "Operator please" }] } } });
    expect(vapi).toMatchObject({ ok: true, call: { provider: "vapi", id: "v1", botName: "Reception", transferred: false, turns: [{ role: "assistant" }, { role: "user" }] } });
    expect(parseCall({ message: { type: "status-update" } })).toMatchObject({ ok: true, ignored: expect.any(String) });
    const retell = parseCall({ event: "call_ended", call: { call_id: "r1", disconnection_reason: "call_transfer", start_timestamp: 1000, end_timestamp: 61000, transcript_object: [{ role: "agent", content: "Hello" }, { role: "user", content: "Hi" }] } });
    expect(retell).toMatchObject({ ok: true, call: { provider: "retell", transferred: true, durationS: 60 } });
    expect(parseCall({ event: "call_analyzed", call: {} })).toMatchObject({ ignored: expect.any(String) });
    expect(parseCall({ call_id: "g1", transcript: "AI: Hello\nUser: I need a human\nplease" })).toMatchObject({ call: { turns: [{ role: "assistant", content: "Hello" }, { role: "user", content: "I need a human please" }] } });
    expect(parseCall({ foo: 1 })).toMatchObject({ ok: false });
    expect(turnsFromText("Agent: hi\nCustomer: yo")).toHaveLength(2);
  });

  it("flags a caller who asked for a person and wasn't transferred, including a promised transfer that failed", () => {
    expect(checkCall(call({ transferred: false, endedReason: "customer-ended-call" })).issues[0]).toMatchObject({ code: "CALL_NOT_TRANSFERRED", severity: "high" });
    expect(checkCall(call({ transferred: false })).issues[0].message).toContain("said it was transferring them");
    expect(checkCall(call({ transferred: true })).issues).toEqual([]);
    const noOffer = call({ turns: [{ role: "user", content: "Let me talk to a real person" }, { role: "assistant", content: "I can help you with that here." }] });
    expect(checkCall(noOffer).issues[0]).toMatchObject({ code: "TRANSFER_NOT_OFFERED", severity: "medium" });
    expect(checkCall(call({ turns: [{ role: "user", content: "What time do you open?" }, { role: "assistant", content: "9am." }] }))).toMatchObject({ humanRequested: false, issues: [] });
  });

  it("stores the call once, raises the incident and checks the bot's answers", async () => {
    const project = get<Project>("SELECT * FROM projects WHERE id = ?", projectId)!;
    const r = await ingestCall(project, call({ transferred: false }));
    expect(r.issues).toHaveLength(1);
    expect(r.graded).toBeGreaterThan(0);
    expect(incidents("CALL_NOT_TRANSFERRED")[0].title).toBe("Voice: Front desk: a caller who asked for a person wasn't transferred");
    expect(get("SELECT human_requested, transferred, turns FROM voice_calls")).toEqual({ human_requested: 1, transferred: 0, turns: 3 });
    expect(await ingestCall(project, call({ transferred: false }))).toMatchObject({ duplicate: true });
  });
});

describe("account changes by chat", () => {
  const ex = (question: string, answer: string) => ({ conversationId: "c", turnIndex: 0, question, answer });
  const flags = (q: string, a: string) => safetyFindings(ex(q, a)).map((f) => f.flag);

  it("flags a bot that changed login details on request without verifying", () => {
    expect(flags("Please change the email on my account to new@mail.com", "Done! I've updated the email on your account to new@mail.com.")).toContain("account_change");
    expect(flags("Turn off two-factor on my Instagram", "Two-factor authentication has been disabled for you.")).toContain("account_change");
  });

  it("leaves verified or refused changes alone", () => {
    expect(flags("Change my email please", "For security, I've sent a verification code to your current email address. Enter it here to continue.")).not.toContain("account_change");
    expect(flags("Change my password", "I can't change that in chat. Use the 'Forgot password' link.")).not.toContain("account_change");
    expect(flags("Where is my order?", "It has been shipped and updated in our system.")).not.toContain("account_change");
  });
});
