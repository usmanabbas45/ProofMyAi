import { all } from "./db";
import { raiseIncident, resolveIncidents } from "./incidents";
import type { AgentStep } from "./agents/checks";

/**
 * Retries that quietly succeed: a run that needed a second or third attempt still ends "success", so no error
 * alert fires, but the API behind it is flaky and will eventually fail for real. Counted per workflow and per
 * agent over 7 days, and alerted when retries become a habit rather than an exception.
 *   - n8n: executions that are a retry of a failed execution (retryOf), and successful runs that report retries.
 *   - Any platform: send `retries` (extra attempts in the run) to /workflow-runs.
 *   - AI agents: a tool step that failed and then succeeded on a later call in the same run.
 */

const WEEK_MS = 7 * 86400000;
export const RETRY_ALERT_RATE = 0.2;
const RETRY_RESOLVE_RATE = 0.1;
const MIN_RUNS = 5;
const MIN_RETRIED = 3;

/** Tools in an agent run that failed and then worked on a later call. */
export function recoveredTools(steps: AgentStep[]): string[] {
  const failed = new Set<string>();
  const recovered = new Set<string>();
  for (const s of steps) {
    if (s.type !== "tool") continue;
    const name = s.name || "tool";
    if (s.error) failed.add(name);
    else if (failed.has(name)) recovered.add(name);
  }
  return [...recovered];
}

export interface RetryRate { key: string; name: string; runs: number; retried: number; rate: number; detail: string }

/** Workflows whose runs keep needing retries (last 7 days). */
export function workflowRetryRates(projectId: number, now = Date.now()): RetryRate[] {
  const since = new Date(now - WEEK_MS).toISOString();
  const rows = all<{ platform: string; workflow_id: string; name: string; runs: number; reported: number; reruns: number }>(
    `SELECT platform, workflow_id, MAX(workflow_name) AS name,
            SUM(CASE WHEN retry_of IS NULL THEN 1 ELSE 0 END) AS runs,
            SUM(CASE WHEN retry_of IS NULL AND status = 'success' AND COALESCE(retries, 0) > 0 THEN 1 ELSE 0 END) AS reported,
            COUNT(DISTINCT CASE WHEN retry_of IS NOT NULL AND status = 'success' THEN retry_of END) AS reruns
       FROM workflow_runs WHERE project_id = ? AND started_at >= ? GROUP BY platform, workflow_id`,
    projectId, since,
  );
  return rows.filter((r) => r.runs > 0).map((r) => {
    const retried = r.reported + r.reruns;
    const parts = [r.reported ? `${r.reported} succeeded only after retrying a step` : "", r.reruns ? `${r.reruns} failed and only worked when the execution was retried` : ""].filter(Boolean);
    return { key: `wf:${r.platform}:${r.workflow_id}:retries`, name: r.name, runs: r.runs, retried, rate: retried / r.runs, detail: parts.join(", ") };
  });
}

/** Agents whose tools keep failing and then working on a later call (last 7 days, latest 500 runs). */
export function agentRetryRates(projectId: number, now = Date.now()): (RetryRate & { tools: string[] })[] {
  const since = new Date(now - WEEK_MS).toISOString().replace("T", " ").slice(0, 19);
  const runs = all<{ agent_name: string; steps_json: string }>(
    "SELECT agent_name, steps_json FROM agent_runs WHERE project_id = ? AND replace(created_at, 'T', ' ') >= ? ORDER BY id DESC LIMIT 500", projectId, since,
  );
  const by = new Map<string, { runs: number; retried: number; tools: Map<string, number> }>();
  for (const r of runs) {
    const a = by.get(r.agent_name) ?? { runs: 0, retried: 0, tools: new Map() };
    a.runs++;
    let steps: AgentStep[] = [];
    try { steps = JSON.parse(r.steps_json); } catch { /* ignore */ }
    const tools = recoveredTools(Array.isArray(steps) ? steps : []);
    if (tools.length) { a.retried++; for (const t of tools) a.tools.set(t, (a.tools.get(t) ?? 0) + 1); }
    by.set(r.agent_name, a);
  }
  return [...by].map(([agent, a]) => {
    const tools = [...a.tools].sort((x, y) => y[1] - x[1]).map(([t]) => t);
    return { key: `agent:${agent}:retries`, name: agent, runs: a.runs, retried: a.retried, rate: a.runs ? a.retried / a.runs : 0, tools,
      detail: tools.length ? `the failing tool${tools.length === 1 ? " was" : "s were"} ${tools.slice(0, 3).map((t) => `"${t}"`).join(", ")}` : "" };
  });
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

export async function retryChecks(projectId: number, now = Date.now()): Promise<number> {
  let raised = 0;
  for (const w of workflowRetryRates(projectId, now)) {
    if (w.runs >= MIN_RUNS && w.retried >= MIN_RETRIED && w.rate >= RETRY_ALERT_RATE) {
      if (await raiseIncident(projectId, {
        module: "workflows", code: "RETRY_RATE_HIGH", severity: "medium",
        title: `"${w.name}" needed retries in ${pct(w.rate)} of runs this week`,
        detail: `${w.retried} of ${w.runs} runs: ${w.detail}. They ended as successes, so no error alert fired, but a step this flaky will fail for real eventually. Find the step that retries (usually an API call) and fix the cause: rate limits, timeouts or an unstable service.`,
        dedupeKey: w.key,
      })) raised++;
    } else if (w.rate < RETRY_RESOLVE_RATE) {
      resolveIncidents(projectId, w.key);
    }
  }
  for (const a of agentRetryRates(projectId, now)) {
    if (a.runs >= MIN_RUNS && a.retried >= MIN_RETRIED && a.rate >= RETRY_ALERT_RATE) {
      if (await raiseIncident(projectId, {
        module: "agents", code: "AGENT_RETRY_RATE_HIGH", severity: "medium",
        title: `Agent "${a.name}": tools failed and needed a retry in ${pct(a.rate)} of runs this week`,
        detail: `${a.retried} of ${a.runs} runs had a tool fail and then work on a later call; ${a.detail}. The runs still finished, so nothing alerted, but every retry costs time and money, and that tool is one bad day from failing outright.`,
        dedupeKey: a.key,
      })) raised++;
    } else if (a.rate < RETRY_RESOLVE_RATE) {
      resolveIncidents(projectId, a.key);
    }
  }
  return raised;
}
