import { all, get, run } from "./db";
import { notify } from "./notify";

export type Module = "chatbot" | "tests" | "agents" | "workflows" | "uptime";
export type IncidentSeverity = "low" | "medium" | "high";

export interface NewIncident {
  module: Module;
  code: string;
  severity: IncidentSeverity;
  title: string;
  detail: string;
  /** Incidents with the same open dedupe key are not repeated (avoids alert storms). */
  dedupeKey?: string;
}

export async function raiseIncident(projectId: number, inc: NewIncident): Promise<boolean> {
  if (inc.dedupeKey) {
    const open = get("SELECT id FROM incidents WHERE project_id = ? AND dedupe_key = ? AND resolved = 0", projectId, inc.dedupeKey);
    if (open) return false;
  }
  run(
    "INSERT INTO incidents (project_id, module, code, severity, title, detail, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
    projectId, inc.module, inc.code, inc.severity, inc.title, inc.detail, inc.dedupeKey ?? null,
  );
  // Each channel decides by its own severity and module settings (low-severity only reaches channels set to "all").
  await notify({ projectId, kind: "problem", module: inc.module, code: inc.code, severity: inc.severity, title: inc.title, detail: inc.detail })
    .catch((err) => console.error("[alerts] failed:", err));
  return true;
}

/** Closes open incidents with this key and tells channels that asked for "resolved" notices. */
export function resolveIncidents(projectId: number, dedupeKey: string): void {
  const open = all<{ module: Module; code: string; severity: IncidentSeverity; title: string }>(
    "SELECT module, code, severity, title FROM incidents WHERE project_id = ? AND dedupe_key = ? AND resolved = 0", projectId, dedupeKey,
  );
  if (!open.length) return;
  run("UPDATE incidents SET resolved = 1, resolved_at = datetime('now') WHERE project_id = ? AND dedupe_key = ? AND resolved = 0", projectId, dedupeKey);
  for (const inc of open) {
    void notify({ projectId, kind: "resolved", module: inc.module, code: inc.code, severity: inc.severity, title: inc.title, detail: "This problem is no longer happening." })
      .catch((err) => console.error("[alerts] failed:", err));
  }
}
