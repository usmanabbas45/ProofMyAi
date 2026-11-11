import { get, run } from "../db";
import { customMatcher, redactDeep, redactPII } from "../pii";
import { raiseIncident } from "../incidents";
import { aiForProject, JudgeError, llmJudgeAgentRun } from "../judge/llm";
import { verifyClaim } from "../outcome";
import { recordTrace } from "../traces";
import { watchSoon } from "../watches";
import { finishRunStart, recordRunStart } from "./health";
import { agentScore, AgentRunSchema, checkAgentRun, stepsLog, totals, type Issue } from "./checks";

interface ProjectLimits {
  agent_cost_budget_usd: number;
  agent_max_steps: number;
  agent_max_ms: number;
  agent_ai_review: number;
  redact_pii: number;
  mask_terms: string | null;
  store_text: number;
}

export type IngestResult = { ok: true; id: number; score: number; issues: Issue[]; started?: boolean } | { ok: false; status: number; error: string };

export async function ingestAgentRun(projectId: number, body: unknown): Promise<IngestResult> {
  const parsed = AgentRunSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") };
  }
  const p = get<ProjectLimits>(
    "SELECT agent_cost_budget_usd, agent_max_steps, agent_max_ms, agent_ai_review, redact_pii, mask_terms, store_text FROM projects WHERE id = ?", projectId,
  );
  if (!p) return { ok: false, status: 404, error: "Project not found" };
  // Personal data is masked before checks, storage and the AI review (run_id and agent_name stay as sent).
  const custom = customMatcher(p.mask_terms);
  const data = p.redact_pii
    ? { ...parsed.data, goal: redactPII(parsed.data.goal, custom), final_output: redactPII(parsed.data.final_output, custom), steps: redactDeep(parsed.data.steps, custom) }
    : parsed.data;

  const existing = get("SELECT id FROM agent_runs WHERE project_id = ? AND external_id = ?", projectId, data.run_id);
  if (existing) return { ok: false, status: 409, error: `Run "${data.run_id}" was already recorded` };
  // A start: remembered so a run that never finishes is alerted (see agents/health.ts).
  if (data.status === "running") {
    recordRunStart(projectId, data.run_id, data.agent_name);
    return { ok: true, id: 0, score: 100, issues: [], started: true };
  }
  const startedAt = finishRunStart(projectId, data.run_id);

  let issues = checkAgentRun(data, { costBudgetUsd: p.agent_cost_budget_usd, maxSteps: p.agent_max_steps, maxMs: p.agent_max_ms });
  // A destructive action a person approved beforehand (same trace_id) is recorded, not alerted.
  if (data.trace_id && issues.some((i) => i.code === "DESTRUCTIVE_ACTION")
    && get("SELECT 1 FROM approvals WHERE project_id = ? AND trace_id = ? AND status = 'approved' AND auto = 0", projectId, data.trace_id)) {
    issues = issues.map((i) => i.code === "DESTRUCTIVE_ACTION" ? { ...i, severity: "low" as const, message: `${i.message.split(". Actions that")[0]}. A person approved it first in Approvals.` } : i);
  }
  const score = agentScore(issues);
  const t = totals(data.steps);
  if (startedAt && t.ms === 0) t.ms = Math.max(0, Date.now() - Date.parse(startedAt));

  const { lastInsertRowid: id } = run(
    `INSERT INTO agent_runs (project_id, external_id, agent_name, goal, status, final_output, steps_json, total_cost_usd, total_ms, issues_json, score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId, data.run_id, data.agent_name,
    p.store_text ? data.goal : "", data.status, p.store_text ? data.final_output : "",
    // Metadata-only mode keeps step names, timings, costs and errors, but not inputs/outputs.
    JSON.stringify(p.store_text ? data.steps : data.steps.map(({ input: _i, output: _o, ...rest }) => rest)),
    t.cost, t.ms, JSON.stringify(issues), score,
  );

  await alertOnIssues(projectId, data.agent_name, data.run_id, issues);
  watchSoon(projectId);
  const worst = issues.filter((i) => i.severity !== "low");
  recordTrace(projectId, data.trace_id, "agents", worst.length === 0 && data.status === "success",
    `Agent "${data.agent_name}" run: ${data.status}, score ${Math.round(score)}`, worst.length ? worst.map((i) => i.message).join(" ") : `${data.steps.length} steps, ${(t.ms / 1000).toFixed(1)}s, $${t.cost.toFixed(4)}`);

  // Don't take the agent's word for it: confirm the result in the real system, after the response.
  if (parsed.data.verify && data.status === "success") {
    void verifyClaim(projectId, { who: `Agent "${data.agent_name}"`, what: data.goal.slice(0, 200), ref: `run ${data.run_id}`, agentRunId: id, traceId: data.trace_id }, parsed.data.verify)
      .catch((err) => console.error("[outcome] check failed:", err));
  }

  // The AI review is slower; it runs after the response so the customer's agent is never blocked.
  if (p.agent_ai_review && aiForProject(projectId) && data.goal.trim() && data.status === "success") {
    void aiReview(id, projectId, data.agent_name, data.run_id, data.goal, stepsLog(data.steps), data.final_output, issues);
  }
  return { ok: true, id, score, issues };
}

async function alertOnIssues(projectId: number, agent: string, runId: string, issues: Issue[]) {
  const high = issues.filter((i) => i.severity === "high");
  if (high.length === 0) return;
  await raiseIncident(projectId, {
    module: "agents", code: high[0].code, severity: "high",
    title: `Agent "${agent}": ${high.map((i) => i.code.replace(/_/g, " ").toLowerCase()).join(", ")}`,
    detail: `Run ${runId}: ${high.map((i) => i.message).join(" ")}`,
    dedupeKey: `agent:${agent}:${high[0].code}`,
  });
}

export async function aiReview(
  id: number, projectId: number, agent: string, runId: string, goal: string, log: string, output: string, issues: Issue[],
): Promise<void> {
  try {
    const verdict = await llmJudgeAgentRun(goal, log, output, { projectId, kind: "agent" });
    const extra: Issue[] = [];
    if (!verdict.goal_achieved) extra.push({ code: "GOAL_NOT_MET", severity: "high", message: `AI review: ${verdict.reason}` });
    if (!verdict.grounded) extra.push({ code: "UNGROUNDED_OUTPUT", severity: "high", message: `AI review: the output claims things the tools never returned. ${verdict.reason}` });
    if (extra.length === 0) extra.push({ code: "AI_REVIEW_PASSED", severity: "low", message: `AI review: ${verdict.reason}` });
    const all = [...issues, ...extra];
    const scored = all.filter((i) => i.code !== "AI_REVIEW_PASSED");
    run("UPDATE agent_runs SET issues_json = ?, score = ? WHERE id = ?", JSON.stringify(all), agentScore(scored), id);
    await alertOnIssues(projectId, agent, runId, extra.filter((i) => i.code !== "AI_REVIEW_PASSED"));
  } catch (err) {
    const message = err instanceof JudgeError ? err.message : "AI review failed";
    const all = [...issues, { code: "AI_REVIEW_SKIPPED", severity: "low" as const, message }];
    run("UPDATE agent_runs SET issues_json = ? WHERE id = ?", JSON.stringify(all), id);
  }
}
