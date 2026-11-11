import { ingestAgentRun } from "@/lib/agents/ingest";
import { json, readIngest } from "@/lib/api";
import { limitError, projectOwner } from "@/lib/billing";
import { get } from "@/lib/db";

export async function POST(req: Request) {
  const r = await readIngest(req);
  if (r instanceof Response) return r;
  const agent = (r.body as { agent_name?: unknown } | null)?.agent_name;
  const owner = projectOwner(r.project.id);
  if (typeof agent === "string" && !get("SELECT 1 FROM agent_runs a JOIN projects p ON p.id = a.project_id WHERE p.user_id = ? AND a.agent_name = ?", owner, agent)) {
    const over = limitError(owner, "monitors");
    if (over) return json({ error: over }, 402);
  }
  const result = await ingestAgentRun(r.project.id, r.body);
  if (!result.ok) return json({ error: result.error }, result.status);
  if (result.started) return json({ started: true, run_id: (r.body as { run_id?: string }).run_id }, 202);
  return json({ id: result.id, score: result.score, issues: result.issues }, 201);
}
