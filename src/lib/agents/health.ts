import { all, get, run } from "../db";
import { raiseIncident, resolveIncidents } from "../incidents";
import { ago, median } from "../workflows/monitor";

/**
 * The quiet failures of an AI agent: it stops running, or it starts runs that never finish. Neither throws an
 * error, so nothing else would ever alert. Agents can report a start (status "running") and later the finished
 * run with the same run_id; without starts, only "stopped running" is checked.
 */

/** SQLite "YYYY-MM-DD HH:MM:SS" (UTC) or ISO, to epoch ms. */
export const toMs = (s: string) => Date.parse(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);

export function recordRunStart(projectId: number, runId: string, agent: string, at = new Date().toISOString()): void {
  run("INSERT OR IGNORE INTO agent_run_starts (project_id, external_id, agent_name, started_at) VALUES (?, ?, ?, ?)", projectId, runId, agent, at);
}

/** Called when the finished run arrives: returns when it started (if a start was reported) and forgets the start. */
export function finishRunStart(projectId: number, runId: string): string | null {
  const s = get<{ started_at: string }>("SELECT started_at FROM agent_run_starts WHERE project_id = ? AND external_id = ?", projectId, runId);
  if (s) run("DELETE FROM agent_run_starts WHERE project_id = ? AND external_id = ?", projectId, runId);
  return s?.started_at ?? null;
}

const alertedSince = (projectId: number, dedupeKey: string, sinceIso: string) =>
  Boolean(get("SELECT 1 FROM incidents WHERE project_id = ? AND dedupe_key = ? AND replace(created_at, 'T', ' ') >= replace(?, 'T', ' ')", projectId, dedupeKey, sinceIso.slice(0, 19)));

/**
 * Each agent's own rhythm, learned from its last 50 runs (no settings needed): alert when the current pause is
 * 1.5× the longest normal pause and at least 3× the usual gap. Same rule as n8n/Make workflows.
 */
export async function stoppedAgentChecks(projectId: number, now = Date.now()): Promise<number> {
  const agents = all<{ agent_name: string }>(
    "SELECT DISTINCT agent_name FROM agent_runs WHERE project_id = ? AND replace(created_at, 'T', ' ') >= ?",
    projectId, new Date(now - 30 * 86400000).toISOString().replace("T", " ").slice(0, 19),
  );
  let raised = 0;
  for (const { agent_name: agent } of agents) {
    const dedupeKey = `agent:${agent}:stopped`;
    const times = all<{ created_at: string }>(
      "SELECT created_at FROM agent_runs WHERE project_id = ? AND agent_name = ? ORDER BY replace(created_at, 'T', ' ') DESC LIMIT 51", projectId, agent,
    ).map((t) => toMs(t.created_at)).filter((t) => !Number.isNaN(t));
    if (times.length < 8) continue;
    const gaps = times.slice(1).map((t, i) => times[i] - t).filter((g) => g >= 0);
    const usual = median(gaps);
    const longest = Math.max(...gaps);
    const limit = Math.max(longest * 1.5, usual * 3, 30 * 60000);
    const pause = now - times[0];
    if (usual > 0 && usual <= 7 * 86400000 && pause > limit) {
      if (alertedSince(projectId, dedupeKey, new Date(times[0]).toISOString())) continue;
      await raiseIncident(projectId, {
        module: "agents", code: "AGENT_STOPPED", severity: "high",
        title: `Agent "${agent}" has gone quiet`,
        detail: `No run for ${ago(pause)}. It normally runs every ${ago(usual)}, and its longest normal pause was ${ago(longest)}. Its schedule or trigger may have stopped, a key may have expired, or the server may be down. Nothing errored, so nothing else would have told you.`,
        dedupeKey,
      });
      raised++;
    } else {
      resolveIncidents(projectId, dedupeKey);
    }
  }
  return raised;
}

/** Runs that reported "running" and never finished: hung, crashed, or killed mid-task. */
export async function unfinishedAgentRuns(projectId: number, now = Date.now()): Promise<number> {
  run("DELETE FROM agent_run_starts WHERE project_id = ? AND started_at < ?", projectId, new Date(now - 7 * 86400000).toISOString());
  const starts = all<{ external_id: string; agent_name: string; started_at: string }>(
    "SELECT external_id, agent_name, started_at FROM agent_run_starts WHERE project_id = ? ORDER BY started_at", projectId,
  );
  const stuck = new Map<string, { agent: string; runs: string[]; oldest: number; since: string }>();
  for (const s of starts) {
    const typical = median(all<{ total_ms: number }>(
      "SELECT total_ms FROM agent_runs WHERE project_id = ? AND agent_name = ? AND status = 'success' AND total_ms > 0 ORDER BY id DESC LIMIT 20", projectId, s.agent_name,
    ).map((r) => r.total_ms));
    const age = now - Date.parse(s.started_at);
    if (age <= Math.max(30 * 60000, typical * 10)) continue;
    const key = `agent:${s.agent_name}:unfinished`;
    const cur = stuck.get(key) ?? { agent: s.agent_name, runs: [], oldest: age, since: s.started_at };
    cur.runs.push(s.external_id);
    stuck.set(key, cur);
  }
  let raised = 0;
  for (const [dedupeKey, s] of stuck) {
    if (alertedSince(projectId, dedupeKey, s.since)) continue;
    const n = s.runs.length;
    await raiseIncident(projectId, {
      module: "agents", code: "AGENT_RUN_UNFINISHED", severity: "high",
      title: `Agent "${s.agent}": ${n} run${n === 1 ? "" : "s"} started but never finished`,
      detail: `Run${n === 1 ? "" : "s"} ${s.runs.slice(0, 5).join(", ")}${n > 5 ? "…" : ""} started ${ago(s.oldest)} ago and never reported a result. The agent may be hung on a slow tool, or the process crashed or was killed mid-task, so that work was never done.`,
      dedupeKey,
    });
    raised++;
  }
  const open = all<{ dedupe_key: string }>("SELECT dedupe_key FROM incidents WHERE project_id = ? AND code = 'AGENT_RUN_UNFINISHED' AND resolved = 0", projectId);
  for (const o of open) if (!stuck.has(o.dedupe_key)) resolveIncidents(projectId, o.dedupe_key);
  return raised;
}

export async function periodicAgentChecks(projectId: number, now = Date.now()): Promise<void> {
  await stoppedAgentChecks(projectId, now);
  await unfinishedAgentRuns(projectId, now);
}
