import { beforeEach, describe, expect, it } from "vitest";
import { all, run } from "@/lib/db";
import { agentRetryRates, recoveredTools, retryChecks, workflowRetryRates } from "@/lib/retries";
import { recordWorkflowRun } from "@/lib/workflows/monitor";
import { mapN8nExecution } from "@/lib/workflows/pollers";
import { freshDb } from "./helpers";

let projectId: number;
beforeEach(() => ({ projectId } = freshDb()));

const at = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const wfRun = (id: string, extra: Record<string, unknown> = {}) =>
  recordWorkflowRun(projectId, { platform: "n8n", workflow_id: "w1", workflow_name: "Lead sync", execution_id: id, status: "success", started_at: at(1), output_items: 3, ...extra } as never);
const incidents = (code: string) => all<{ title: string; detail: string; resolved: number }>("SELECT title, detail, resolved FROM incidents WHERE code = ?", code);

describe("retries that quietly succeed", () => {
  it("maps n8n's retryOf so a re-run of a failed execution is recognised", () => {
    expect(mapN8nExecution({ id: 9, workflowId: 1, status: "success", retryOf: 7, mode: "retry" }, new Map())).toMatchObject({ retry_of: "7" });
    expect(mapN8nExecution({ id: 9, workflowId: 1, status: "success" }, new Map())).toMatchObject({ retry_of: null });
  });

  it("counts runs that needed retries and alerts when it becomes a habit, then resolves", async () => {
    for (let i = 0; i < 6; i++) await wfRun(`ok${i}`);
    await wfRun("r1", { retries: 2 });
    await wfRun("r2", { retries: 1 });
    await wfRun("f1", { status: "error", error_message: "429" });
    await wfRun("f1-retry", { retry_of: "f1" });
    expect(workflowRetryRates(projectId)[0]).toMatchObject({ runs: 9, retried: 3 });
    expect(await retryChecks(projectId)).toBe(1);
    expect(incidents("RETRY_RATE_HIGH")[0].title).toBe('"Lead sync" needed retries in 33% of runs this week');
    expect(incidents("RETRY_RATE_HIGH")[0].detail).toContain("2 succeeded only after retrying a step, 1 failed and only worked when the execution was retried");
    expect(await retryChecks(projectId)).toBe(0); // no repeat
    run("UPDATE workflow_runs SET retries = NULL, retry_of = NULL");
    await retryChecks(projectId);
    expect(incidents("RETRY_RATE_HIGH")[0].resolved).toBe(1);
  });

  it("doesn't alert on the odd retry", async () => {
    for (let i = 0; i < 20; i++) await wfRun(`ok${i}`);
    await wfRun("r1", { retries: 1 });
    expect(await retryChecks(projectId)).toBe(0);
  });

  it("finds agent tools that failed and then worked, and alerts per agent", async () => {
    const step = (name: string, error: string | null = null) => ({ type: "tool", name, error, duration_ms: 1, tokens: 0, cost_usd: 0 });
    expect(recoveredTools([step("crm", "timeout"), step("crm"), step("email", "500")] as never)).toEqual(["crm"]);
    const add = (id: string, steps: unknown[]) => run(
      "INSERT INTO agent_runs (project_id, external_id, agent_name, goal, status, final_output, steps_json, total_cost_usd, total_ms, issues_json, score) VALUES (?, ?, 'lead-bot', '', 'success', 'x', ?, 0, 1, '[]', 100)",
      projectId, id, JSON.stringify(steps),
    );
    for (let i = 0; i < 3; i++) add(`r${i}`, [step("hubspot_create", "429 Too Many Requests"), step("hubspot_create")]);
    for (let i = 0; i < 4; i++) add(`ok${i}`, [step("hubspot_create")]);
    expect(agentRetryRates(projectId)[0]).toMatchObject({ runs: 7, retried: 3, tools: ["hubspot_create"] });
    expect(await retryChecks(projectId)).toBe(1);
    expect(incidents("AGENT_RETRY_RATE_HIGH")[0].detail).toContain('"hubspot_create"');
  });
});
