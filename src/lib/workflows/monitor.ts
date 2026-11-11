import { z } from "zod";
import { all, get, run } from "../db";
import { raiseIncident, resolveIncidents } from "../incidents";
import { truncate } from "../text";
import { recordTrace } from "../traces";
import { watchSoon } from "../watches";

export const PLATFORMS = ["n8n", "make", "zapier", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const WorkflowRunSchema = z.object({
  platform: z.enum(PLATFORMS).default("other"),
  workflow_id: z.string().min(1).max(200),
  workflow_name: z.string().max(300).optional(),
  execution_id: z.string().min(1).max(200),
  status: z.enum(["success", "error", "warning", "running", "waiting", "cancelled", "crashed"]),
  started_at: z.string().datetime({ offset: true }).optional(),
  duration_ms: z.number().nonnegative().nullish(),
  output_items: z.number().int().nonnegative().nullish(),
  /** Items the run received (e.g. new rows or orders fetched). Tells "nothing to process" apart from "broken". */
  input_items: z.number().int().nonnegative().nullish(),
  error_message: z.string().max(5000).nullish(),
  /** Your id for one end-to-end request, shared with /chat-events, /agent-runs, /approvals and /verify. */
  trace_id: z.string().min(1).max(200).optional(),
});
export type WorkflowRunInput = z.infer<typeof WorkflowRunSchema>;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Returns true if the execution was new (not previously recorded). */
export async function recordWorkflowRun(projectId: number, input: WorkflowRunInput): Promise<boolean> {
  const name = input.workflow_name || input.workflow_id;
  const startedAt = input.started_at ? new Date(input.started_at).toISOString() : new Date().toISOString();
  const status = input.status === "crashed" ? "error" : input.status;
  const res = run(
    `INSERT OR IGNORE INTO workflow_runs (project_id, platform, workflow_id, workflow_name, execution_id, status, started_at, duration_ms, output_items, input_items, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId, input.platform, input.workflow_id, name, input.execution_id, status, startedAt,
    input.duration_ms ?? null, input.output_items ?? null, input.input_items ?? null, input.error_message ?? null,
  );
  const silent = status === "success" && input.output_items === 0;
  // Runs once per newly recorded (or newly finished) run: the trace step, and a check of the customer's watches.
  const trace = () => {
    watchSoon(projectId);
    recordTrace(projectId, input.trace_id, "workflows", status === "success" && !silent,
      `Workflow "${name}": ${silent ? "success with 0 items" : status}`, input.error_message ?? (input.output_items != null ? `${input.output_items} items out` : ""));
  };
  if (res.changes === 0) {
    // A run first reported as running/waiting has now finished: update it and evaluate the final status.
    const upd = run(
      `UPDATE workflow_runs SET status = ?, workflow_name = ?, duration_ms = ?, output_items = ?, input_items = ?, error_message = ?
        WHERE project_id = ? AND platform = ? AND execution_id = ? AND status IN ('running', 'waiting') AND ? NOT IN ('running', 'waiting')`,
      status, name, input.duration_ms ?? null, input.output_items ?? null, input.input_items ?? null, input.error_message ?? null,
      projectId, input.platform, input.execution_id, status,
    );
    if (upd.changes === 0) return false;
    trace();
    const first = get<{ started_at: string }>("SELECT started_at FROM workflow_runs WHERE project_id = ? AND platform = ? AND execution_id = ?", projectId, input.platform, input.execution_id);
    await evaluateRun(projectId, { ...input, status, workflow_name: name, started_at: first?.started_at ?? startedAt });
    return true;
  }
  trace();
  await evaluateRun(projectId, { ...input, status, workflow_name: name, started_at: startedAt });
  return true;
}

export const ago = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 120 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} hours` : `${Math.round(m / 1440)} days`;
};

/**
 * Is an empty "success" a broken workflow or just a quiet spell? Without input counts we learn the workflow's own
 * pattern from its last 50 runs: one that is rarely empty alerts on the first empty run; one that often has
 * nothing to do alerts only when the current run of empties is longer than any quiet spell it had before.
 */
export function judgeEmptyRun(projectId: number, r: { platform: string; workflow_id: string; execution_id: string; started_at: string }):
  { alert: boolean; reason: string } {
  const history = all<{ output_items: number; started_at: string }>(
    `SELECT output_items, started_at FROM workflow_runs WHERE project_id = ? AND platform = ? AND workflow_id = ? AND status = 'success'
       AND output_items IS NOT NULL AND execution_id <> ? AND started_at <= ? ORDER BY started_at DESC LIMIT 50`,
    projectId, r.platform, r.workflow_id, r.execution_id, r.started_at,
  );
  const lastGood = history.find((h) => h.output_items > 0);
  const lastGoodText = lastGood ? ` Last run with output: ${ago(Date.parse(r.started_at) - Date.parse(lastGood.started_at))} earlier (${lastGood.output_items} items).` : "";
  const hint = " If there was simply nothing to process, send input_items: 0 with the run and ProofMyAI will treat it as a quiet run.";
  if (history.length < 5) return { alert: true, reason: `Reported success with 0 output items.${lastGoodText}${hint}` };

  let streak = 1;
  while (streak - 1 < history.length && history[streak - 1].output_items === 0) streak++;
  let longest = 0;
  for (let i = streak - 1, cur = 0; i < history.length; i++) {
    cur = history[i].output_items === 0 ? cur + 1 : 0;
    longest = Math.max(longest, cur);
  }
  const zeros = history.filter((h) => h.output_items === 0).length;
  const typical = median(history.filter((h) => h.output_items > 0).map((h) => h.output_items));
  if (zeros / history.length < 0.1) {
    return { alert: true, reason: `This workflow is almost never empty (${zeros} of its last ${history.length} runs) and usually produces about ${typical} items.${lastGoodText}` };
  }
  if (streak > Math.max(3, longest)) {
    return { alert: true, reason: `${streak} empty runs in a row. Quiet spells are normal for this workflow, but the longest one before was ${longest} run${longest === 1 ? "" : "s"}.${lastGoodText}` };
  }
  return { alert: false, reason: "" };
}

async function evaluateRun(projectId: number, r: WorkflowRunInput & { workflow_name: string }) {
  const key = (code: string) => `wf:${r.platform}:${r.workflow_id}:${code}`;
  const label = `${r.platform === "other" ? "Workflow" : r.platform} "${r.workflow_name}"`;

  if (r.status === "warning") {
    await raiseIncident(projectId, {
      module: "workflows", code: "WORKFLOW_WARNING", severity: "medium",
      title: `${label} finished with warnings`,
      detail: r.error_message
        ? truncate(r.error_message, 500)
        : `Execution ${r.execution_id} completed, but some steps failed and the run carried on (errors were ignored or handled). Part of the data may be missing.`,
      dedupeKey: key("warning"),
    });
    return;
  }
  if (r.status === "error") {
    await raiseIncident(projectId, {
      module: "workflows", code: "WORKFLOW_FAILED", severity: "high",
      title: `${label} failed`,
      detail: r.error_message ? truncate(r.error_message, 500) : `Execution ${r.execution_id} ended in an error.`,
      dedupeKey: key("failed"),
    });
    return;
  }
  if (r.status === "success") {
    resolveIncidents(projectId, key("failed"));
    resolveIncidents(projectId, key("stale"));
    resolveIncidents(projectId, key("warning"));
    resolveIncidents(projectId, key("stuck"));
    if (r.output_items === 0 && r.input_items != null && r.input_items > 0) {
      // It received work and produced nothing: broken, whatever the history says.
      await raiseIncident(projectId, {
        module: "workflows", code: "SILENT_FAILURE", severity: "high",
        title: `${label} received ${r.input_items} items but produced nothing`,
        detail: `Execution ${r.execution_id} reported success, but none of the ${r.input_items} input items made it to the output. A step is filtering or dropping everything.`,
        dedupeKey: key("silent"),
      });
    } else if (r.output_items === 0) {
      const verdict = r.input_items === 0 ? { alert: false, reason: "" } : judgeEmptyRun(projectId, { ...r, started_at: r.started_at! });
      if (verdict.alert) {
        await raiseIncident(projectId, {
          module: "workflows", code: "SILENT_FAILURE", severity: "medium",
          title: `${label} succeeded but produced nothing`,
          detail: `Execution ${r.execution_id}: ${verdict.reason}`,
          dedupeKey: key("silent"),
        });
      } else {
        run("UPDATE workflow_runs SET quiet = 1 WHERE project_id = ? AND platform = ? AND execution_id = ?", projectId, r.platform, r.execution_id);
      }
    } else if (r.output_items && r.output_items > 0) {
      resolveIncidents(projectId, key("silent"));
      await checkVolume(projectId, { ...r, output_items: r.output_items, started_at: r.started_at! }, label, key("volume"));
    }
    if (r.duration_ms != null) {
      const history = all<{ duration_ms: number }>(
        `SELECT duration_ms FROM workflow_runs WHERE project_id = ? AND platform = ? AND workflow_id = ? AND status = 'success'
           AND duration_ms IS NOT NULL AND execution_id <> ? ORDER BY started_at DESC LIMIT 20`,
        projectId, r.platform, r.workflow_id, r.execution_id,
      ).map((x) => x.duration_ms);
      const typical = median(history);
      if (history.length >= 5 && typical > 0 && r.duration_ms > typical * 3 && r.duration_ms - typical > 5000) {
        await raiseIncident(projectId, {
          module: "workflows", code: "SLOW_EXECUTION", severity: "low",
          title: `${label} is running slowly`,
          detail: `Took ${(r.duration_ms / 1000).toFixed(1)}s vs a typical ${(typical / 1000).toFixed(1)}s.`,
        });
      }
    }
  }
}

/**
 * Partial failures: items that went in but didn't come out, and output far below or far above this workflow's normal
 * (an upstream API returning a fraction of the data, or a loop writing everything twice).
 */
async function checkVolume(projectId: number, r: WorkflowRunInput & { output_items: number; started_at: string; workflow_name: string }, label: string, dedupeKey: string) {
  const out = r.output_items;
  if (r.input_items != null && r.input_items >= 10 && out < r.input_items * 0.5) {
    await raiseIncident(projectId, {
      module: "workflows", code: "ITEMS_DROPPED", severity: "medium",
      title: `${label} lost ${r.input_items - out} of ${r.input_items} items`,
      detail: `Execution ${r.execution_id} received ${r.input_items} items but only ${out} came out. A filter, a failed step or bad data is dropping records.`,
      dedupeKey,
    });
    return;
  }
  const history = all<{ output_items: number }>(
    `SELECT output_items FROM workflow_runs WHERE project_id = ? AND platform = ? AND workflow_id = ? AND status = 'success'
       AND output_items > 0 AND execution_id <> ? AND started_at <= ? ORDER BY started_at DESC LIMIT 20`,
    projectId, r.platform, r.workflow_id, r.execution_id, r.started_at,
  ).map((h) => h.output_items);
  const typical = median(history);
  if (history.length >= 10 && typical >= 10 && out < typical * 0.25 && r.input_items == null) {
    await raiseIncident(projectId, {
      module: "workflows", code: "VOLUME_DROP", severity: "medium",
      title: `${label} produced far less than usual`,
      detail: `Execution ${r.execution_id} produced ${out} items; it usually produces about ${typical}. An upstream API may be returning partial data or a step is filtering too much.`,
      dedupeKey,
    });
  } else if (history.length >= 10 && out > typical * 5 && out - typical >= 50) {
    await raiseIncident(projectId, {
      module: "workflows", code: "VOLUME_SPIKE", severity: "medium",
      title: `${label} produced ${Math.round(out / typical)}× more than usual`,
      detail: `Execution ${r.execution_id} produced ${out} items; it usually produces about ${typical}. Check for a loop, a re-run of old data or duplicates being written.`,
      dedupeKey,
    });
  } else {
    resolveIncidents(projectId, dedupeKey);
  }
}

/** Periodic checks across all workflows: error-rate spikes and workflows that stopped running. */
export async function periodicWorkflowChecks(projectId: number, now = Date.now()): Promise<void> {
  await stoppedWorkflowChecks(projectId, now);
  await stuckRunChecks(projectId, now);
  const rates = all<{ platform: string; workflow_id: string; workflow_name: string; total: number; errors: number }>(
    `SELECT platform, workflow_id, MAX(workflow_name) AS workflow_name, COUNT(*) AS total,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
       FROM workflow_runs WHERE project_id = ? AND started_at >= ?
      GROUP BY platform, workflow_id`,
    projectId, new Date(Date.now() - 86400000).toISOString(),
  );
  for (const r of rates) {
    const dedupeKey = `wf:${r.platform}:${r.workflow_id}:error-rate`;
    if (r.total >= 5 && r.errors / r.total > 0.2) {
      await raiseIncident(projectId, {
        module: "workflows", code: "HIGH_ERROR_RATE", severity: "high",
        title: `"${r.workflow_name}" fails ${Math.round((r.errors / r.total) * 100)}% of the time`,
        detail: `${r.errors} of ${r.total} executions failed in the last 24 hours.`,
        dedupeKey,
      });
    } else if (r.total >= 5) {
      resolveIncidents(projectId, dedupeKey);
    }
  }

  const sources = all<{ id: number; platform: string; name: string; expected_interval_min: number | null }>(
    "SELECT id, platform, name, expected_interval_min FROM workflow_sources WHERE project_id = ? AND expected_interval_min IS NOT NULL",
    projectId,
  );
  for (const s of sources) {
    const last = get<{ started_at: string }>(
      "SELECT MAX(started_at) AS started_at FROM workflow_runs WHERE project_id = ? AND platform = ?", projectId, s.platform,
    );
    const lastMs = last?.started_at ? Date.parse(last.started_at) : 0;
    const limitMs = (s.expected_interval_min ?? 0) * 60000 * 1.5;
    if (limitMs > 0 && Date.now() - lastMs > limitMs) {
      await raiseIncident(projectId, {
        module: "workflows", code: "STALE", severity: "high",
        title: `No ${s.platform} runs from "${s.name}" recently`,
        detail: lastMs
          ? `Last execution was ${Math.round((Date.now() - lastMs) / 60000)} minutes ago; expected every ${s.expected_interval_min} minutes. A trigger may be broken or the workflow deactivated.`
          : `No executions recorded yet; expected every ${s.expected_interval_min} minutes.`,
        dedupeKey: `wfsource:${s.id}:stale`,
      });
    } else {
      resolveIncidents(projectId, `wfsource:${s.id}:stale`);
    }
  }
}

const fmtGap = (ms: number) => ago(ms);
/** One alert per episode: true when this alert was already raised (and maybe resolved by hand) since `sinceIso`. */
const alertedSince = (projectId: number, dedupeKey: string, sinceIso: string) =>
  Boolean(get("SELECT 1 FROM incidents WHERE project_id = ? AND dedupe_key = ? AND created_at >= datetime(?)", projectId, dedupeKey, sinceIso));

/**
 * Each workflow's own rhythm, learned from its last 50 runs (no settings needed): alert when the current pause is
 * 1.5× longer than the longest normal pause (nights and weekends included), and at least 3× its usual gap.
 */
export async function stoppedWorkflowChecks(projectId: number, now = Date.now()): Promise<void> {
  const flows = all<{ platform: string; workflow_id: string; name: string }>(
    `SELECT platform, workflow_id, MAX(workflow_name) AS name FROM workflow_runs WHERE project_id = ? AND started_at >= ? GROUP BY platform, workflow_id`,
    projectId, new Date(now - 30 * 86400000).toISOString(),
  );
  for (const f of flows) {
    const dedupeKey = `wf:${f.platform}:${f.workflow_id}:stale`;
    const times = all<{ started_at: string }>(
      "SELECT started_at FROM workflow_runs WHERE project_id = ? AND platform = ? AND workflow_id = ? ORDER BY started_at DESC LIMIT 51",
      projectId, f.platform, f.workflow_id,
    ).map((t) => Date.parse(t.started_at));
    if (times.length < 8) continue;
    const gaps = times.slice(1).map((t, i) => times[i] - t).filter((g) => g >= 0);
    const usual = median(gaps);
    const longest = Math.max(...gaps);
    const limit = Math.max(longest * 1.5, usual * 3, 30 * 60000);
    const pause = now - times[0];
    if (usual > 0 && usual <= 7 * 86400000 && pause > limit) {
      if (alertedSince(projectId, dedupeKey, new Date(times[0]).toISOString())) continue;
      await raiseIncident(projectId, {
        module: "workflows", code: "WORKFLOW_STOPPED", severity: "high",
        title: `${f.platform === "other" ? "Workflow" : f.platform} "${f.name}" has stopped running`,
        detail: `Last run ${fmtGap(pause)} ago. It normally runs every ${fmtGap(usual)}, and its longest normal pause was ${fmtGap(longest)}. A trigger may be broken, the workflow switched off, or the server down.`,
        dedupeKey,
      });
    } else {
      resolveIncidents(projectId, dedupeKey);
    }
  }
}

/** Runs still "running" long after they should have finished (hung, or the server crashed mid-run). */
export async function stuckRunChecks(projectId: number, now = Date.now()): Promise<void> {
  const running = all<{ platform: string; workflow_id: string; workflow_name: string; execution_id: string; started_at: string }>(
    `SELECT platform, workflow_id, workflow_name, execution_id, started_at FROM workflow_runs
      WHERE project_id = ? AND status = 'running' AND started_at >= ? ORDER BY started_at`,
    projectId, new Date(now - 7 * 86400000).toISOString(),
  );
  const stuck = new Map<string, { name: string; platform: string; execution_id: string; age: number; since: string }>();
  for (const r of running) {
    const typical = median(all<{ duration_ms: number }>(
      `SELECT duration_ms FROM workflow_runs WHERE project_id = ? AND platform = ? AND workflow_id = ? AND status = 'success' AND duration_ms IS NOT NULL ORDER BY started_at DESC LIMIT 20`,
      projectId, r.platform, r.workflow_id,
    ).map((d) => d.duration_ms));
    const age = now - Date.parse(r.started_at);
    const k = `wf:${r.platform}:${r.workflow_id}:stuck`;
    if (age > Math.max(30 * 60000, typical * 10) && !stuck.has(k)) stuck.set(k, { name: r.workflow_name, platform: r.platform, execution_id: r.execution_id, age, since: r.started_at });
  }
  for (const [dedupeKey, s] of stuck) {
    if (alertedSince(projectId, dedupeKey, s.since)) continue;
    await raiseIncident(projectId, {
      module: "workflows", code: "WORKFLOW_STUCK", severity: "high",
      title: `${s.platform === "other" ? "Workflow" : s.platform} "${s.name}" is stuck`,
      detail: `Execution ${s.execution_id} has been running for ${fmtGap(s.age)} without finishing. It may be hung on a slow API or the server may have restarted mid-run. Stop it and check the last step it reached.`,
      dedupeKey,
    });
  }
  const open = all<{ dedupe_key: string }>("SELECT dedupe_key FROM incidents WHERE project_id = ? AND code = 'WORKFLOW_STUCK' AND resolved = 0", projectId);
  for (const o of open) if (!stuck.has(o.dedupe_key)) resolveIncidents(projectId, o.dedupe_key);
}

/**
 * Remembers whether each n8n workflow / Make scenario is switched on and how many incomplete executions it has, and
 * alerts on the change: switched off (by a person, or automatically after errors), or new incomplete executions.
 */
export async function recordWorkflowState(
  projectId: number, platform: "n8n" | "make", workflowId: string, name: string, state: { active?: boolean | null; incomplete?: number | null },
): Promise<void> {
  const prev = get<{ active: number | null; incomplete: number | null }>(
    "SELECT active, incomplete FROM workflow_state WHERE project_id = ? AND platform = ? AND workflow_id = ?", projectId, platform, workflowId,
  );
  const label = `${platform} "${name}"`;
  const offKey = `wf:${platform}:${workflowId}:inactive`;
  if (state.active === false && prev?.active === 1) {
    await raiseIncident(projectId, {
      module: "workflows", code: "WORKFLOW_DEACTIVATED", severity: "high",
      title: `${label} was switched off`,
      detail: `It was active and is now inactive, so its trigger no longer fires. ${platform === "make" ? "Make switches scenarios off automatically after repeated errors." : "n8n can switch workflows off when a trigger fails to start."} Switch it back on once the cause is fixed.`,
      dedupeKey: offKey,
    });
  } else if (state.active === true) {
    resolveIncidents(projectId, offKey);
  }
  const incKey = `wf:${platform}:${workflowId}:incomplete`;
  if (state.incomplete != null && state.incomplete > (prev?.incomplete ?? 0)) {
    await raiseIncident(projectId, {
      module: "workflows", code: "INCOMPLETE_EXECUTIONS", severity: "medium",
      title: `${label} has ${state.incomplete} incomplete execution${state.incomplete === 1 ? "" : "s"}`,
      detail: `Runs that failed part-way are waiting in Make's "Incomplete executions" list. Their data has not been processed. Fix the cause, then resolve or retry them in Make.`,
      dedupeKey: incKey,
    });
  } else if (state.incomplete === 0) {
    resolveIncidents(projectId, incKey);
  }
  run(
    `INSERT INTO workflow_state (project_id, platform, workflow_id, active, incomplete) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (project_id, platform, workflow_id) DO UPDATE SET active = COALESCE(excluded.active, active), incomplete = COALESCE(excluded.incomplete, incomplete)`,
    projectId, platform, workflowId, state.active == null ? null : state.active ? 1 : 0, state.incomplete ?? null,
  );
}
