import { WatchPanel } from "../WatchPanel";
import { SafePromptCard } from "../FixViews";
import { fixAvailability, latestFixes } from "@/lib/fixes";
import Link from "next/link";
import { SubmitButton } from "@/components/client";
import { Badge, Empty, Flash, PageHeader, ScoreBadge, StatusBadge, timeAgo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { judgeProvider, llmAvailable } from "@/lib/judge/llm";
import { projectAccess } from "@/lib/projects";
import { addKbDocAction, addRuleAction, deleteAuditAction, deleteKbDocAction, deleteRuleAction, importKbUrlAction, policyChangeAction, startAuditAction } from "../actions";
import { policyDiff } from "@/lib/policywatch";
import { Sparkline } from "@/components/charts";
import { projectRules, RULE_KINDS } from "@/lib/rules";

export const metadata = { title: "Chatbot audits" };

const SAMPLE_CSV = `conversation_id,role,message
1,customer,How long does shipping take?
1,bot,Standard shipping takes 3-7 business days.
2,customer,I want a refund or I'm calling my lawyer
2,bot,Have a great day!`;

export default async function ChatbotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { project: p, role } = projectAccess(user.id, Number((await params).id));
  const flash = await searchParams;
  const docs = all<{ id: number; title: string; chars: number; updated_at: string; version: number; source_url: string | null; checked_at: string | null; check_error: string | null; content: string; pending_content: string | null; pending_since: string | null }>(
    `SELECT id, title, LENGTH(content) AS chars, updated_at, version, source_url, checked_at, check_error, content, pending_content, pending_since
       FROM kb_docs WHERE project_id = ? ORDER BY pending_content IS NULL, id DESC`, p.id,
  );
  const rules = projectRules(p.id);
  const trend = all<{ score: number }>(
    "SELECT score FROM audits WHERE project_id = ? AND status IN ('done','live') AND score IS NOT NULL ORDER BY id DESC LIMIT 12", p.id,
  ).map((r) => Math.round(r.score)).reverse();
  const audits = all<{ id: number; name: string; mode: string; status: string; score: number | null; created_at: string; items: number; problems: number }>(
    `SELECT a.id, a.name, a.mode, a.status, a.score, a.created_at,
            (SELECT COUNT(*) FROM audit_items i WHERE i.audit_id = a.id) AS items,
            (SELECT COUNT(*) FROM audit_items i WHERE i.audit_id = a.id AND COALESCE(i.corrected_verdict, i.verdict) <> 'correct') AS problems
       FROM audits a WHERE a.project_id = ? ORDER BY a.id DESC`, p.id,
  );

  return (
    <div>
      <Flash {...flash} />
      <PageHeader title="Chatbot audits" subtitle="Grade every answer your chatbot gave against your own help docs" />

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>1. Knowledge base</h3>
              <span className="sub">The truth your bot should follow: FAQs, policies, prices, help articles.</span>
            </div>
            <Badge tone={docs.length ? "ok" : "warn"}>{docs.length} article{docs.length === 1 ? "" : "s"}</Badge>
          </div>
          <form action={importKbUrlAction} className="kb-import">
            <input type="hidden" name="projectId" value={p.id} />
            <label htmlFor="kb-url"><strong>🌐 Import from your website</strong> <span className="hint">(fastest: your FAQ, help center, shipping or returns page)</span></label>
            <div className="row" style={{ flexWrap: "nowrap", gap: 8, marginTop: 6 }}>
              <input id="kb-url" name="url" type="text" inputMode="url" required placeholder="yourshop.com/faq" style={{ flex: 1, minWidth: 0 }} />
              <SubmitButton pendingText="Importing… (up to a minute)">Import</SubmitButton>
            </div>
            <label className="check" style={{ marginTop: 6 }}><input type="checkbox" name="crawl" defaultChecked /> Also import the help and policy pages it links to (up to 25)</label>
          </form>
          <div className="kb-or"><span>or</span></div>
          <form action={addKbDocAction}>
            <input type="hidden" name="projectId" value={p.id} />
            <div className="field">
              <label htmlFor="files">Upload files <span className="hint">(.txt, .md or .html, several at once)</span></label>
              <input id="files" name="files" type="file" multiple accept=".txt,.md,.markdown,.csv,.html,text/plain,text/markdown" />
            </div>
            <details>
              <summary>…or paste an article</summary>
              <div className="field">
                <label htmlFor="title">Title</label>
                <input id="title" name="title" type="text" placeholder="Refund policy" maxLength={200} />
              </div>
              <div className="field">
                <label htmlFor="content">Content</label>
                <textarea id="content" name="content" placeholder="Customers can request a refund within 30 days…" />
              </div>
            </details>
            <div style={{ marginTop: 12 }}><SubmitButton pendingText="Saving…">Add to knowledge base</SubmitButton></div>
          </form>
          {docs.length > 0 ? (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} style={d.pending_content ? { background: "var(--warn-bg, #fdf3dc)" } : undefined}>
                      <td>
                        📄 {d.title} <span className="faint">v{d.version}</span>
                        {d.source_url ? <div className="faint" style={{ fontSize: 12 }} title={d.source_url}>🌐 {d.check_error ? `Couldn't re-read the page: ${d.check_error}` : `Checked against the website daily${d.checked_at ? ` · last ${timeAgo(d.checked_at)}` : ""}`}</div> : null}
                        {d.pending_content ? (() => {
                          const diff = policyDiff(d.content, d.pending_content);
                          return (
                            <div style={{ marginTop: 8 }}>
                              <strong>🔔 Changed on the website {timeAgo(d.pending_since)}.</strong> Answers are still checked against v{d.version}.
                              {diff.removed[0] ? <div className="sub">Was: &ldquo;{diff.removed[0].slice(0, 200)}&rdquo;</div> : null}
                              {diff.added[0] ? <div className="sub">Now: &ldquo;{diff.added[0].slice(0, 200)}&rdquo;</div> : null}
                              {Math.max(diff.removed.length, diff.added.length) > 1 ? <div className="faint">+{Math.max(diff.removed.length, diff.added.length) - 1} more changes</div> : null}
                              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                                {(["accept", "keep"] as const).map((decision) => (
                                  <form key={decision} action={policyChangeAction}>
                                    <input type="hidden" name="projectId" value={p.id} />
                                    <input type="hidden" name="docId" value={d.id} />
                                    <input type="hidden" name="decision" value={decision} />
                                    <SubmitButton className={decision === "accept" ? "btn btn-sm" : "btn btn-ghost btn-sm"} pendingText="…">{decision === "accept" ? `Update to v${d.version + 1}` : "Keep current"}</SubmitButton>
                                  </form>
                                ))}
                              </div>
                            </div>
                          );
                        })() : null}
                      </td>
                      <td className="faint">{Math.ceil(d.chars / 1000)}k chars</td>
                      <td style={{ textAlign: "right" }}>
                        <form action={deleteKbDocAction}>
                          <input type="hidden" name="projectId" value={p.id} />
                          <input type="hidden" name="docId" value={d.id} />
                          <SubmitButton className="btn btn-ghost btn-sm" pendingText="…" confirm={`Remove "${d.title}"?`}>Remove</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="card" id="new-audit">
          <div className="card-head">
            <div>
              <h3>2. New audit</h3>
              <span className="sub">Export chats from Intercom, Tidio, Crisp, Zendesk or your own bot as CSV or JSON.</span>
            </div>
            <Badge tone={llmAvailable() ? "brand" : "muted"}>{judgeProvider() === "gemini" ? "Gemini judge" : judgeProvider() === "anthropic" ? "Claude judge" : "Basic mode"}</Badge>
          </div>
          <form action={startAuditAction}>
            <input type="hidden" name="projectId" value={p.id} />
            <div className="field">
              <label htmlFor="name">Audit name <span className="hint">(optional)</span></label>
              <input id="name" name="name" type="text" placeholder="September chats" maxLength={120} />
            </div>
            <div className="field">
              <label htmlFor="file">Transcript file <span className="hint">(.csv or .json, up to 500 conversations)</span></label>
              <input id="file" name="file" type="file" accept=".csv,.json,text/csv,application/json" />
              <p className="hint" style={{ marginTop: 6 }}>
                Needs 3 columns: <code>conversation_id</code>, <code>role</code> (customer / bot) and <code>message</code>. <a href="/samples/proofmyai-sample-chats.csv" download>⬇ Download a sample file</a>
              </p>
            </div>
            <details>
              <summary>📥 How do I export my chats?</summary>
              <ul className="export-help">
                <li><strong>Intercom:</strong> no export needed. Use <a href={`/app/p/${p.id}/live`}>Live tracking → Connect Intercom</a> and every Fin reply is checked automatically.</li>
                <li><strong>Tidio, Zendesk, Crisp, Chatbase and most others:</strong> open the conversations / inbox / chat logs area and look for <em>Export</em> or <em>Download</em> (CSV). Some plans only offer it to admins.</li>
                <li><strong>No export button?</strong> Connect the bot live instead (one HTTP step in n8n or Make, see <a href={`/app/p/${p.id}/connect`}>Connect</a>), or copy a few chats into &ldquo;paste transcripts&rdquo; below.</li>
                <li><strong>WhatsApp bot:</strong> connect it once in <a href={`/app/p/${p.id}/live`}>Live tracking</a> (WAHA or Twilio) instead of exporting.</li>
                <li><strong>Different columns?</strong> Rename the headers in Excel or Google Sheets to <code>conversation_id, role, message</code>, or <a href="/support">send us the file</a> and we&apos;ll convert it for you.</li>
              </ul>
            </details>
            <details>
              <summary>…or paste transcripts</summary>
              <textarea name="pasted" placeholder={SAMPLE_CSV} style={{ minHeight: 140 }} className="mono" />
              <p className="hint">CSV columns: <code>conversation_id, role, message</code>. Roles: customer/user and bot/assistant. JSON: <code>{`[{"id":"1","messages":[{"role":"user","content":"…"}]}]`}</code></p>
            </details>
            <div style={{ marginTop: 12 }}>
              <SubmitButton pendingText="Starting audit…">Start audit</SubmitButton>
            </div>
          </form>
          {docs.length === 0 ? <p className="hint" style={{ marginTop: 10 }}>Tip: add your help articles first. Without them ProofMyAI can&apos;t tell if an answer is made up.</p> : null}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h3>📏 Your rules</h3><span className="sub">Your own business rules, checked on every answer (uploads and live). A broken rule is always flagged as high risk.</span></div>
          <Badge tone={rules.length ? "brand" : "muted"}>{rules.length} rule{rules.length === 1 ? "" : "s"}</Badge>
        </div>
        {rules.length > 0 ? (
          <div className="row" style={{ marginBottom: 14 }}>
            {rules.map((r) => (
              <form key={r.id} action={deleteRuleAction} className="badge" style={{ padding: "4px 6px 4px 12px" }}>
                <input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="ruleId" value={r.id} />
                {r.kind === "never_say" ? "🚫 Never say" : r.kind === "must_include" ? "✅ Must say" : r.kind === "ai_check" ? "🧠 AI check:" : "🙋 Hand over on"} “{r.pattern}”
                <button className="btn btn-ghost btn-sm" style={{ padding: "0 6px", marginLeft: 6 }} aria-label={`Remove rule ${r.pattern}`}>✕</button>
              </form>
            ))}
          </div>
        ) : null}
        <form action={addRuleAction} className="row" style={{ alignItems: "flex-end" }}>
          <input type="hidden" name="projectId" value={p.id} />
          <div style={{ flex: "1 1 260px" }}>
            <label htmlFor="kind">Rule</label>
            <select id="kind" name="kind" defaultValue="never_say">
              {(Object.keys(RULE_KINDS) as (keyof typeof RULE_KINDS)[]).map((k) => <option key={k} value={k}>{RULE_KINDS[k].label}</option>)}
            </select>
          </div>
          <div style={{ flex: "2 1 260px" }}>
            <label htmlFor="pattern">Word or phrase <span className="hint">(for &quot;must include&quot;: topic =&gt; required words; for a custom AI check: one sentence in plain English)</span></label>
            <input id="pattern" name="pattern" type="text" required minLength={2} maxLength={200} placeholder="lifetime warranty · or · windscreen => not covered · or · Pricing answers must mention the free trial" />
          </div>
          <SubmitButton pendingText="Adding…">Add rule</SubmitButton>
        </form>
      </div>

      <SafePromptCard fix={latestFixes(p.id, null).get("system_prompt")} projectId={p.id} back={`/app/p/${p.id}/chatbot`} canEdit={role !== "viewer"} aiOff={fixAvailability(p.id, p.user_id)} />

      {trend.length >= 2 ? (
        <div className="card">
          <div className="card-head">
            <div><h3>📈 Quality trend</h3><span className="sub">Accuracy score of your last {trend.length} audits (oldest → newest)</span></div>
            <ScoreBadge score={trend[trend.length - 1]} />
          </div>
          <Sparkline values={trend} color="var(--brand)" width={600} height={70} />
        </div>
      ) : null}

      <div className="card">
        <div className="card-head"><h3>Audit history</h3></div>
        {audits.length === 0 ? (
          <Empty icon="💬" title="No audits yet">Upload your first transcript export above. Results appear in about a minute.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Audit</th><th>Status</th><th>Score</th><th>Answers</th><th>Problems</th><th>Mode</th><th>When</th><th /></tr></thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/app/p/${p.id}/chatbot/audit/${a.id}`}><strong>{a.name}</strong></Link></td>
                    <td><StatusBadge status={a.status} /></td>
                    <td><ScoreBadge score={a.score} /></td>
                    <td>{a.items}</td>
                    <td>{a.problems ? <Badge tone="bad">{a.problems}</Badge> : <Badge tone="ok">0</Badge>}</td>
                    <td className="sub">{a.mode === "ai" ? "AI judge" : "Basic"}</td>
                    <td className="sub">{timeAgo(a.created_at)}</td>
                    <td>
                      <form action={deleteAuditAction}>
                        <input type="hidden" name="projectId" value={p.id} />
                        <input type="hidden" name="auditId" value={a.id} />
                        <SubmitButton className="btn btn-ghost btn-sm" pendingText="…" confirm="Delete this audit and its results?">Delete</SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <WatchPanel projectId={p.id} module="chatbot" back={`/app/p/${p.id}/chatbot`} canEdit={role !== "viewer"} />
    </div>
  );
}
