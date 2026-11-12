import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, Flash, PageHeader, timeAgo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { get } from "@/lib/db";
import { FEATURE_NAMES } from "@/lib/judge/features";
import { judgeLabel } from "@/lib/judge/llm";
import { MIN_TRAINING_LABELS } from "@/lib/ml/risk";
import { projectAccess } from "@/lib/projects";
import { projectRole } from "@/lib/team";
import { channelsFor } from "@/lib/notify";
import { deleteProjectAction, regenerateKeyAction, retrainAction, updatePrivacyAction, updateSettingsAction } from "../actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const flash = await searchParams;
  const role = projectRole(user.id, id);
  if (role && role !== "owner") {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="alert alert-info">Only the project owner can change settings, alerts, privacy and the API key. You have {role} access. See <a href={`/app/p/${id}/team`}>Team</a> for who owns this project.</div>
      </div>
    );
  }
  const p = projectAccess(user.id, id, "owner").project;
  const model = get<{ n_samples: number; val_accuracy: number; trained_at: string }>("SELECT n_samples, val_accuracy, trained_at FROM risk_models WHERE project_id = ?", p.id);
  const labels = get<{ n: number; bad: number | null }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN COALESCE(i.corrected_verdict, i.verdict) <> 'correct' THEN 1 ELSE 0 END) AS bad
       FROM audit_items i JOIN audits a ON a.id = i.audit_id WHERE a.project_id = ? AND i.feedback IS NOT NULL`, p.id,
  );
  const pid = <input type="hidden" name="projectId" value={p.id} />;
  const channels = channelsFor(p.id);

  return (
    <div>
      <Flash {...flash} />
      <PageHeader title="Settings" subtitle={`Project: ${p.name}`} />
      <div className="grid grid-2">
        <form action={updateSettingsAction} className="card">
          {pid}
          <h3>Project & alerts</h3>
          <div className="field"><label htmlFor="name">Project name</label><input id="name" name="name" type="text" defaultValue={p.name} maxLength={100} /></div>
          <div className="field">
            <label htmlFor="em">Weekly report email {process.env.RESEND_API_KEY || !isAdmin(user.email) ? null : <span className="hint">(admin: needs RESEND_API_KEY on the server)</span>}</label>
            <input id="em" name="alert_email" type="email" defaultValue={p.alert_email ?? ""} placeholder="you@company.com" />
          </div>
          <p className="sub" style={{ marginTop: -4 }}>Where problems are sent (email, WhatsApp, Slack…) is chosen on the <a href={`/app/p/${p.id}/alerts`}>🔔 Alerts</a> page.</p>
          <div className="field">
            <label htmlFor="rt">Alert when the chatbot hasn&apos;t replied within <span className="hint">(seconds; 0 = off. Checked every minute for live tracking, every 15 minutes for Twilio)</span></label>
            <input id="rt" name="reply_timeout_sec" type="number" min="0" max="86400" defaultValue={p.reply_timeout_sec} />
          </div>
          <div className="field">
            <label htmlFor="ph">Promised follow-ups must have a task or a follow-up within <span className="hint">(hours; when the bot says &quot;I&apos;ll get back to you&quot;)</span></label>
            <input id="ph" name="promise_hours" type="number" min="1" max="720" defaultValue={p.promise_hours ?? 24} />
          </div>
          <h3 style={{ marginTop: 18 }}>AI agent limits</h3>
          <div className="grid grid-3">
            <div className="field"><label htmlFor="b">Budget / run ($)</label><input id="b" name="agent_cost_budget_usd" type="number" step="any" min="0.0001" defaultValue={p.agent_cost_budget_usd} /></div>
            <div className="field"><label htmlFor="s">Max steps</label><input id="s" name="agent_max_steps" type="number" min="1" defaultValue={p.agent_max_steps} /></div>
            <div className="field"><label htmlFor="t">Max seconds</label><input id="t" name="agent_max_seconds" type="number" min="1" defaultValue={Math.round(p.agent_max_ms / 1000)} /></div>
          </div>
          <label className="check"><input type="checkbox" name="agent_ai_review" defaultChecked={Boolean(p.agent_ai_review)} /> AI review of agent outputs (goal achieved? grounded in tool results?)</label>
          <h3 style={{ marginTop: 18 }}>Reports</h3>
          <label className="check"><input type="checkbox" name="weekly_digest" defaultChecked={Boolean(p.weekly_digest)} /> 📬 Send a weekly summary to the weekly report email</label>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="brand">Report brand name <span className="hint">(agencies: your agency name on shared client reports; empty = ProofMyAI)</span></label>
            <input id="brand" name="report_brand" type="text" defaultValue={p.report_brand ?? ""} maxLength={80} placeholder="Your Agency Ltd" />
          </div>
          <div className="row" style={{ marginTop: 16 }}><SubmitButton pendingText="Saving…">Save settings</SubmitButton></div>
        </form>

        <div className="stack">
          <div className="card">
            <h3>🔔 Alerts</h3>
            <p className="sub">Choose email, WhatsApp, Slack, Teams, SMS, Telegram and more, each with its own rules.</p>
            <a className="btn btn-ghost" href={`/app/p/${p.id}/alerts`}>Manage alerts ({channels.length})</a>
          </div>
          <div className="card">
            <h3>API key</h3>
            <p className="sub">Used by your agents, n8n and Make to send runs. Keep it secret.</p>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <code style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.api_key.slice(0, 14)}••••••••••••</code>
              <CopyButton text={p.api_key} />
            </div>
            <form action={regenerateKeyAction} style={{ marginTop: 12 }}>{pid}<SubmitButton className="btn btn-ghost btn-sm" confirm="The current key will stop working immediately. Continue?">Regenerate key</SubmitButton></form>
          </div>
        </div>
      </div>

      <form action={updatePrivacyAction} className="card" id="privacy">
        {pid}
        <div className="card-head">
          <div><h3>🔒 Data & privacy</h3><span className="sub">Control what ProofMyAI masks, stores and sends to an AI provider for this project. See the <a href="/security" target="_blank">Trust Center</a> and <a href="/dpa" target="_blank">DPA</a>.</span></div>
        </div>
        <div className="grid grid-2">
          <div>
            <label className="check"><input type="checkbox" name="redact_pii" defaultChecked={Boolean(p.redact_pii)} /> Mask personal data before storing or AI checking: emails, phone numbers, card numbers, IBANs, IPs, UK postcodes, UK number plates and self-introduced names (&quot;my name is …&quot;)</label>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="mask_terms">Extra words to mask <span className="hint">(one per line: customer names, account numbers, internal codes. Replaced with [masked])</span></label>
              <textarea id="mask_terms" name="mask_terms" rows={4} defaultValue={p.mask_terms ?? ""} placeholder={"Anna Smith\nAB Dealers\nPolicy WF-"} />
            </div>
          </div>
          <div>
            <div className="field">
              <label htmlFor="retention_days">Keep chats, agent runs and test answers for</label>
              <select id="retention_days" name="retention_days" defaultValue={String(p.retention_days)}>
                <option value="0">Until I delete them</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </select>
              <span className="hint">Older data is deleted automatically every 15 minutes (with the scheduled checks).</span>
            </div>
            <label className="check" style={{ marginTop: 8 }}><input type="checkbox" name="store_text" defaultChecked={Boolean(p.store_text)} /> Store conversation text. Turn off to keep only results (verdict, reason, scores), never the customer&apos;s words or the bot&apos;s reply.</label>
            <label className="check" style={{ marginTop: 8 }}><input type="checkbox" name="use_ai" defaultChecked={Boolean(p.use_ai)} /> Use the AI judge ({judgeLabel()}). Turn off to keep all data inside ProofMyAI: checks then use rules and your neural model only.</label>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}><SubmitButton pendingText="Saving…">Save privacy settings</SubmitButton></div>
      </form>

      <div className="card">
        <div className="card-head">
          <div><h3>🧠 Your neural risk model</h3><span className="sub">A deep neural network (2 hidden layers, Adam optimiser, early stopping) trained only on this project&apos;s reviewed answers. It learns which answers <em>your</em> business considers wrong and ranks them first.</span></div>
          <Badge tone={model ? "ok" : "muted"}>{model ? "Trained" : "Not trained yet"}</Badge>
        </div>
        <div className="grid grid-4">
          <div className="stat"><span className="stat-label">Reviewed answers</span><span className="stat-value">{labels?.n ?? 0}</span><span className="stat-foot">{MIN_TRAINING_LABELS} needed to train</span></div>
          <div className="stat"><span className="stat-label">Marked as bad</span><span className="stat-value">{labels?.bad ?? 0}</span><span className="stat-foot">needs good and bad examples</span></div>
          <div className="stat"><span className="stat-label">Validation accuracy</span><span className="stat-value">{model ? `${Math.round(model.val_accuracy * 100)}%` : "–"}</span><span className="stat-foot">on held-out reviews</span></div>
          <div className="stat"><span className="stat-label">Last trained</span><span className="stat-value" style={{ fontSize: 20 }}>{model ? timeAgo(model.trained_at) : "never"}</span><span className="stat-foot">{model ? `${model.n_samples} samples` : ""}</span></div>
        </div>
        <div className="progress" style={{ margin: "14px 0" }}><span style={{ width: `${Math.min(100, ((labels?.n ?? 0) / MIN_TRAINING_LABELS) * 100)}%` }} /></div>
        <div className="row">
          <form action={retrainAction}>{pid}<SubmitButton pendingText="Training…">{model ? "Retrain model" : "Train model"}</SubmitButton></form>
          <a className="btn btn-ghost" href={`/app/p/${p.id}/export`}>⬇ Export training data (JSONL)</a>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Inputs: {FEATURE_NAMES.length} signals ({FEATURE_NAMES.slice(0, 5).join(", ")}, …). The export is ready for fine-tuning a larger model once you have thousands of reviews.
          Active judge: <strong>{judgeLabel()}</strong>.
        </p>
      </div>

      <form action={deleteProjectAction} className="card" style={{ borderColor: "var(--bad)" }}>
        {pid}
        <h3 style={{ color: "var(--bad)" }}>Delete project</h3>
        <p className="sub">Deletes all audits, tests, runs and incidents for this project. This cannot be undone.</p>
        <div className="row">
          <input name="confirm" type="text" placeholder={`Type "${p.name}" to confirm`} style={{ maxWidth: 320 }} />
          <SubmitButton className="btn btn-danger" pendingText="Deleting…">Delete project</SubmitButton>
        </div>
      </form>
    </div>
  );
}
