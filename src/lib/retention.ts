import { all, run, transaction } from "./db";

export const RETENTION_OPTIONS = [0, 7, 30, 90, 365] as const;

/**
 * Deletes customer content older than each project's retention setting: chatbot answers (and audits
 * left empty), AI agent runs and nightly-test answers. Workflow run records (status, timing, error) are kept because the n8n/Make pollers
 * would otherwise re-import and re-alert on old executions.
 */
export function purgeExpired(): { projects: number; items: number; agentRuns: number; testRuns: number } {
  const projects = all<{ id: number; retention_days: number }>("SELECT id, retention_days FROM projects WHERE retention_days > 0");
  let items = 0, agentRuns = 0, testRuns = 0;
  for (const p of projects) {
    const cutoff = `-${Math.floor(p.retention_days)} days`;
    transaction(() => {
      items += run(
        `DELETE FROM audit_items WHERE audit_id IN (SELECT id FROM audits WHERE project_id = ?)
           AND COALESCE(created_at, (SELECT created_at FROM audits a WHERE a.id = audit_items.audit_id)) < datetime('now', ?)`,
        p.id, cutoff,
      ).changes;
      run(
        "DELETE FROM audits WHERE project_id = ? AND created_at < datetime('now', ?) AND NOT EXISTS (SELECT 1 FROM audit_items i WHERE i.audit_id = audits.id)",
        p.id, cutoff,
      );
      agentRuns += run("DELETE FROM agent_runs WHERE project_id = ? AND created_at < datetime('now', ?)", p.id, cutoff).changes;
      testRuns += run("DELETE FROM test_runs WHERE project_id = ? AND created_at < datetime('now', ?)", p.id, cutoff).changes;
      run("DELETE FROM trace_events WHERE project_id = ? AND at < ?", p.id, new Date(Date.now() - p.retention_days * 86400000).toISOString());
      run("DELETE FROM promises WHERE project_id = ? AND created_at < ?", p.id, new Date(Date.now() - p.retention_days * 86400000).toISOString());
    });
  }
  return { projects: projects.length, items, agentRuns, testRuns };
}
