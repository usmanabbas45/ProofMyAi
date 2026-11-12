import { WatchPanel } from "../WatchPanel";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, Empty, Flash, PageHeader, ScoreBadge, Stat, StatusBadge, timeAgo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { projectAccess } from "@/lib/projects";
import { workflowSnippets } from "@/lib/snippets";
import { truncate } from "@/lib/text";
import { everyLabel, HEARTBEAT_EVERY, type Heartbeat } from "@/lib/heartbeats";
import { addHeartbeatAction, addWorkflowSourceAction, deleteHeartbeatAction, deleteSourceAction, pollNowAction } from "../actions";

export const metadata = { title: "n8n & Make" };

export default async function WorkflowsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { project: p, role } = projectAccess(user.id, Number((await params).id));
  const flash = await searchParams;
  const sources = all<{ id: number; platform: string; name: string; base_url: string; scenario_ids: string; expected_interval_min: number | null; last_polled_at: string | null; last_error: string | null }>(
    "SELECT id, platform, name, base_url, scenario_ids, expected_interval_min, last_polled_at, last_error FROM workflow_sources WHERE project_id = ? ORDER BY id", p.id,
  );
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const perWorkflow = all<{ platform: string; workflow_id: string; name: string; total: number; errors: number; last: string; avg_ms: number | null; retried: number }>(
    `SELECT platform, workflow_id, MAX(workflow_name) AS name, COUNT(*) AS total, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
            MAX(started_at) AS last, AVG(duration_ms) AS avg_ms,
            SUM(CASE WHEN retry_of IS NULL AND status = 'success' AND COALESCE(retries, 0) > 0 THEN 1 ELSE 0 END)
              + COUNT(DISTINCT CASE WHEN retry_of IS NOT NULL AND status = 'success' THEN retry_of END) AS retried
       FROM workflow_runs WHERE project_id = ? AND started_at >= ? GROUP BY platform, workflow_id ORDER BY errors DESC, total DESC`,
    p.id, since,
  );
  const totals = get<{ n: number; errors: number | null; silent: number | null }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
            SUM(CASE WHEN status = 'success' AND output_items = 0 AND quiet = 0 THEN 1 ELSE 0 END) AS silent
       FROM workflow_runs WHERE project_id = ? AND started_at >= ?`, p.id, since,
  );
  const recent = all<{ id: number; platform: string; workflow_name: string; execution_id: string; status: string; started_at: string; duration_ms: number | null; output_items: number | null; quiet: number; error_message: string | null }>(
    "SELECT * FROM workflow_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 40", p.id,
  );
  const sn = workflowSnippets(process.env.APP_URL || "http://localhost:3000", p.api_key);
  const pid = <input type="hidden" name="projectId" value={p.id} />;
  const beats = all<Heartbeat>("SELECT * FROM job_heartbeats WHERE project_id = ? ORDER BY id", p.id);
  const hbBase = `${(process.env.APP_URL || "https://proofmyai.com").replace(/\/+$/, "")}/api/hb`;
  const HB = { new: ["muted", "waiting for first check-in"], up: ["ok", "on time"], late: ["bad", "late"], failed: ["bad", "reported a failure"] } as const;
  const rate = totals?.n ? Math.round(((totals.n - (totals.errors ?? 0)) / totals.n) * 100) : null;

  return (
    <div>
      <Flash {...flash} />
      <PageHeader title="n8n & Make monitoring" subtitle="Failures, silent failures, stuck or switched-off workflows, volume drops and workflows that stopped running" />
      <div className="grid grid-4">
        <Stat label="Executions (7 days)" value={totals?.n ?? 0} />
        <Stat label="Success rate" value={rate == null ? "–" : `${rate}%`} />
        <Stat label="Errors" value={totals?.errors ?? 0} />
        <Stat label="Silent failures" value={totals?.silent ?? 0} foot="success but 0 output" />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><div><h3>Connections</h3><span className="sub">ProofMyAI checks these every 15 minutes.</span></div></div>
          {sources.map((s) => (
            <div key={s.id} className="card" style={{ boxShadow: "none", marginBottom: 12 }}>
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <strong>{s.platform === "n8n" ? "🟠" : "🟣"} {s.name}</strong> <Badge>{s.platform}</Badge>
                  <div className="faint mono">{s.base_url}</div>
                  <div className="faint">Checked {timeAgo(s.last_polled_at)}{s.expected_interval_min ? ` · alerts if silent for ${Math.round(s.expected_interval_min * 1.5)} min` : ""}</div>
                  {s.last_error ? <div style={{ color: "var(--bad)" }}>⚠ {s.last_error}</div> : null}
                </div>
                <div className="row">
                  <form action={pollNowAction}>{pid}<input type="hidden" name="sourceId" value={s.id} /><SubmitButton className="btn btn-ghost btn-sm" pendingText="Checking…">Check now</SubmitButton></form>
                  <form action={deleteSourceAction}>{pid}<input type="hidden" name="sourceId" value={s.id} /><SubmitButton className="btn btn-ghost btn-sm" pendingText="…" confirm="Remove this connection?">Remove</SubmitButton></form>
                </div>
              </div>
            </div>
          ))}
          <details open={sources.length === 0}>
            <summary>+ Connect n8n</summary>
            <form action={addWorkflowSourceAction}>
              {pid}<input type="hidden" name="platform" value="n8n" />
              <div className="field"><label htmlFor="n8n-url">n8n URL</label><input id="n8n-url" name="base_url" type="url" required placeholder="https://yourname.app.n8n.cloud" /></div>
              <div className="field"><label htmlFor="n8n-key">n8n API key <span className="hint">(n8n → Settings → n8n API → Create API key)</span></label><input id="n8n-key" name="api_key" type="password" required /></div>
              <div className="field"><label htmlFor="n8n-int">Alert if no runs for… <span className="hint">(minutes, optional)</span></label><input id="n8n-int" name="expected_interval_min" type="number" min={1} placeholder="60" /></div>
              <SubmitButton pendingText="Connecting…">Connect n8n</SubmitButton>
            </form>
          </details>
          <details>
            <summary>+ Connect Make</summary>
            <form action={addWorkflowSourceAction}>
              {pid}<input type="hidden" name="platform" value="make" />
              <div className="field">
                <label htmlFor="make-zone">Make zone URL</label>
                <select id="make-zone" name="base_url" defaultValue="https://eu1.make.com">
                  {["eu1", "eu2", "us1", "us2"].map((z) => <option key={z} value={`https://${z}.make.com`}>{z}.make.com</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="make-key">API token <span className="hint">(Make → Profile → API access → Add token, scope: scenarios:read)</span></label><input id="make-key" name="api_key" type="password" required /></div>
              <div className="field"><label htmlFor="make-ids">Scenario IDs <span className="hint">(the number in the scenario URL, comma separated)</span></label><input id="make-ids" name="scenario_ids" type="text" required placeholder="1234567, 2345678" /></div>
              <div className="field"><label htmlFor="make-int">Alert if no runs for… <span className="hint">(minutes, optional)</span></label><input id="make-int" name="expected_interval_min" type="number" min={1} placeholder="60" /></div>
              <SubmitButton pendingText="Connecting…">Connect Make</SubmitButton>
            </form>
          </details>
        </div>

        <div className="card">
          <div className="card-head"><div><h3>Faster alerts via webhook</h3><span className="sub">Optional. Gets errors to you within seconds and works with Zapier or any tool.</span></div></div>
          <p><strong>Webhook URL:</strong> <code>{sn.url}</code> <CopyButton text={sn.url} /></p>
          <p><strong>Header:</strong> <code>Authorization: Bearer {p.api_key.slice(0, 12)}…</code> <CopyButton text={`Bearer ${p.api_key}`} label="Copy header value" /></p>
          <details>
            <summary>n8n: Error Trigger workflow</summary>
            <ol className="sub">
              <li>Create a new workflow and add an <strong>Error Trigger</strong> node.</li>
              <li>Add an <strong>HTTP Request</strong> node: Method POST, URL above, header <code>Authorization</code> as above, Body = JSON:</li>
            </ol>
            <pre>{sn.n8nBody}</pre><CopyButton text={sn.n8nBody} />
            <p className="sub" style={{ marginTop: 8 }}>3. In every workflow&apos;s <strong>Settings → Error workflow</strong>, pick this workflow.</p>
          </details>
          <details>
            <summary>Make: add to the end of a scenario</summary>
            <p className="sub">Add an <strong>HTTP → Make a request</strong> module (POST, JSON) at the end of the scenario, and another on an error-handler route with <code>&quot;status&quot;: &quot;error&quot;</code>:</p>
            <pre>{sn.makeBody}</pre><CopyButton text={sn.makeBody} />
          </details>
          <details>
            <summary>Any tool (cURL)</summary>
            <pre>{sn.curl}</pre><CopyButton text={sn.curl} />
          </details>
        </div>
      </div>

      <div className="card" id="heartbeats">
        <div className="card-head"><div><h3>💓 Heartbeats</h3><span className="sub">For any scheduled job (cron, script, Zapier, a webhook-triggered n8n flow): it calls its URL when it finishes, and you get an alert if the call doesn&apos;t come. This catches the job that never started, which no error handler can.</span></div></div>
        {beats.map((h) => (
          <div key={h.id} className="row between" style={{ padding: "10px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <strong>{h.name}</strong> <Badge tone={HB[h.status][0]}>{HB[h.status][1]}</Badge>
              <div className="faint">Every {everyLabel(h.every_min)} (+{h.grace_min} min grace) · last check-in {timeAgo(h.last_ping_at)}{h.last_message ? ` · “${truncate(h.last_message, 80)}”` : ""}</div>
              <div className="faint mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{hbBase}/{h.token}</div>
            </div>
            <div className="row">
              <CopyButton text={`${hbBase}/${h.token}`} label="Copy URL" />
              <form action={deleteHeartbeatAction}>{pid}<input type="hidden" name="hbId" value={h.id} /><SubmitButton className="btn btn-ghost btn-sm" pendingText="…" confirm={`Delete heartbeat "${h.name}"?`}>Delete</SubmitButton></form>
            </div>
          </div>
        ))}
        <form action={addHeartbeatAction} className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "flex-end" }}>
          {pid}
          <div className="field" style={{ margin: 0 }}><label htmlFor="hb-name">Job name</label><input id="hb-name" name="name" type="text" required maxLength={100} placeholder="Nightly invoice sync" /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="hb-every">Runs every</label>
            <select id="hb-every" name="every_min" defaultValue="60">{HEARTBEAT_EVERY.map((m) => <option key={m} value={m}>{everyLabel(m)}</option>)}</select>
          </div>
          <SubmitButton className="btn btn-sm" pendingText="Adding…">Add heartbeat</SubmitButton>
        </form>
        <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>At the end of the job, call the URL (GET or POST), e.g. an HTTP Request node in n8n or <code>curl -fsS URL</code> in a script. To report a failure straight away, call <code>URL/fail</code> (add <code>?msg=…</code> to say why).</p>
      </div>

      <div className="card">
        <h3>Workflows (7 days)</h3>
        {perWorkflow.length === 0 ? <Empty icon="⚙️" title="No executions yet">Connect n8n or Make above, or send runs to the webhook.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Workflow</th><th>Platform</th><th>Runs</th><th>Success</th><th>Errors</th><th title="Runs that only succeeded after a retry: no error alert, but a flaky step">Needed retries</th><th>Avg time</th><th>Last run</th></tr></thead>
              <tbody>
                {perWorkflow.map((w) => (
                  <tr key={`${w.platform}:${w.workflow_id}`}>
                    <td><strong>{w.name}</strong></td><td><Badge>{w.platform}</Badge></td><td>{w.total}</td>
                    <td><ScoreBadge score={Math.round(((w.total - w.errors) / w.total) * 100)} /></td>
                    <td>{w.errors ? <Badge tone="bad">{w.errors}</Badge> : "0"}</td>
                    <td>{w.retried ? <Badge tone={w.retried / w.total >= 0.2 ? "warn" : "muted"}>{w.retried} · {Math.round((w.retried / w.total) * 100)}%</Badge> : "0"}</td>
                    <td className="sub">{w.avg_ms == null ? "–" : `${(w.avg_ms / 1000).toFixed(1)}s`}</td>
                    <td className="sub">{timeAgo(w.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recent.length > 0 ? (
        <div className="card">
          <h3>Latest executions</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Workflow</th><th>Execution</th><th>Output</th><th>Time</th><th>Error</th><th>When</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td><StatusBadge status={r.status === "success" && r.output_items === 0 && !r.quiet ? "warning" : r.status} /></td>
                    <td>{r.workflow_name}</td>
                    <td className="faint mono">{truncate(r.execution_id, 18)}</td>
                    <td className="sub">{r.output_items == null ? "–" : r.quiet ? "0 items (quiet)" : `${r.output_items} items`}</td>
                    <td className="sub">{r.duration_ms == null ? "–" : `${(r.duration_ms / 1000).toFixed(1)}s`}</td>
                    <td className="cell-text" style={{ color: "var(--bad)" }}>{r.error_message ? truncate(r.error_message, 140) : ""}</td>
                    <td className="sub">{timeAgo(r.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <WatchPanel projectId={p.id} module="workflows" back={`/app/p/${p.id}/workflows`} canEdit={role !== "viewer"} />
    </div>
  );
}
