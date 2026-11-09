import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh, CopyButton, SubmitButton } from "@/components/client";
import { Badge, Empty, Flash, HBars, PageHeader, ScoreRing, SeverityBadge, VerdictBadge } from "@/components/ui";
import { fixList, riskSummary } from "@/lib/audit/run";
import { ArticleFix, SafePromptCard } from "../../../FixViews";
import { fixAvailability, isBehaviourGroup, latestFixes } from "@/lib/fixes";
import { FLAG_LABELS, FLAG_SEVERITY, SAFETY_FLAGS, isSafetyFlag, type ConvFlag } from "@/lib/judge/conversation";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { DIAGNOSIS_TEXT, type Diagnosis } from "@/lib/judge/evidence";
import { VERDICT_LABELS, VERDICTS, type Verdict } from "@/lib/judge/types";
import { MIN_TRAINING_LABELS } from "@/lib/ml/risk";
import { projectAccess } from "@/lib/projects";
import { addItemToTestsAction, feedbackAction, fixWithAiAction, shareAuditAction } from "../../../actions";

export const metadata = { title: "Audit results" };

const PAGE_SIZE = 50;
const VERDICT_COLOR: Record<Verdict, string> = {
  correct: "var(--ok)", unsupported: "var(--warn)", hallucination: "var(--bad)",
  should_escalate: "var(--bad)", off_policy: "var(--brand)", unclear: "var(--info)",
};

interface Item {
  id: number; conversation_id: string; question: string; answer: string; verdict: Verdict; severity: string;
  reason: string; source_doc: string | null; evidence: string | null; diagnosis: Diagnosis | null; risk: number | null; feedback: string | null; corrected_verdict: Verdict | null;
  frustrated: number; rule_hit: string | null; conv_flags: string | null; latency_ms: number | null; bot_error: string | null;
}

const flagLike = (f: string) => `(',' || conv_flags || ',') LIKE '%,${f},%'`;
const SAFETY_ANY = SAFETY_FLAGS.map(flagLike).join(" OR ");
const CONV_ONLY = ["re_ask", "restart", "fallback", "contradiction"].map(flagLike).join(" OR ");
const STATED_AS_FACT = `${flagLike("confident_wrong")} AND COALESCE(corrected_verdict, verdict) <> 'correct'`;

export default async function AuditPage({ params, searchParams }: {
  params: Promise<{ id: string; auditId: string }>;
  searchParams: Promise<{ v?: string; sort?: string; page?: string; ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id, auditId } = await params;
  const { project: p, role } = projectAccess(user.id, Number(id));
  const canEdit = role !== "viewer";
  const audit = get<{ id: number; name: string; status: string; score: number | null; error: string | null; mode: string; judge: string | null; share_token: string | null }>(
    "SELECT id, name, status, score, error, mode, judge, share_token FROM audits WHERE id = ? AND project_id = ?", Number(auditId), p.id,
  );
  if (!audit) notFound();
  const sp = await searchParams;
  const filter = sp.v && (sp.v === "problems" || sp.v === "frustrated" || sp.v === "conversation" || sp.v === "safety" || sp.v === "fact" || (VERDICTS as readonly string[]).includes(sp.v)) ? sp.v : "problems";
  const sort = sp.sort === "order" ? "order" : "risk";
  const page = Math.max(1, Number(sp.page) || 1);
  const base = `/app/p/${p.id}/chatbot/audit/${audit.id}`;
  const qs = (o: Record<string, string | number>) => `?${new URLSearchParams({ v: filter, sort, page: "1", ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;

  const counts = all<{ verdict: Verdict; n: number }>(
    "SELECT COALESCE(corrected_verdict, verdict) AS verdict, COUNT(*) AS n FROM audit_items WHERE audit_id = ? GROUP BY 1", audit.id,
  );
  const total = counts.reduce((s, c) => s + c.n, 0);
  const problems = total - (counts.find((c) => c.verdict === "correct")?.n ?? 0);
  const reviewed = get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_items WHERE audit_id = ? AND feedback IS NOT NULL", audit.id)?.n ?? 0;

  const where = filter === "problems" ? "AND COALESCE(corrected_verdict, verdict) <> 'correct'"
    : filter === "frustrated" ? "AND frustrated = 1"
    : filter === "conversation" ? `AND conv_flags IS NOT NULL AND (${CONV_ONLY})`
    : filter === "safety" ? `AND (${SAFETY_ANY})`
    : filter === "fact" ? `AND ${STATED_AS_FACT}` : "AND COALESCE(corrected_verdict, verdict) = ?";
  const args: (string | number)[] = filter === "problems" || filter === "frustrated" || filter === "conversation" || filter === "safety" || filter === "fact" ? [audit.id] : [audit.id, filter];
  const risk = riskSummary(audit.id);
  const flagEntries = Object.entries(risk.flags) as [ConvFlag, number][];
  const flagTotal = flagEntries.filter(([f]) => !isSafetyFlag(f)).reduce((a, [, n]) => a + n, 0);
  const safetyTotal = get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_items WHERE audit_id = ? AND (${SAFETY_ANY})`, audit.id)?.n ?? 0;
  const frustrated = get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_items WHERE audit_id = ? AND frustrated = 1", audit.id)?.n ?? 0;
  const shareUrl = audit.share_token ? `${process.env.APP_URL || ""}/r/${audit.share_token}` : null;
  const matching = get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_items WHERE audit_id = ? ${where}`, ...args)?.n ?? 0;
  const items = all<Item>(
    `SELECT id, conversation_id, question, answer, verdict, severity, reason, source_doc, evidence, diagnosis, risk, feedback, corrected_verdict, frustrated, rule_hit,
            conv_flags, latency_ms, bot_error
       FROM audit_items WHERE audit_id = ? ${where}
      ORDER BY ${sort === "risk" ? "COALESCE(risk, 0) DESC, id" : "id"} LIMIT ? OFFSET ?`,
    ...args, PAGE_SIZE, (page - 1) * PAGE_SIZE,
  );
  const fixes = audit.status === "done" || audit.status === "live" ? fixList(audit.id) : [];
  const articleFixes = latestFixes(p.id, audit.id);
  const promptFix = latestFixes(p.id, null).get("system_prompt");
  const fixBlocked = fixAvailability(p.id, p.user_id);
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));

  return (
    <div>
      <AutoRefresh active={audit.status === "running" || audit.status === "live"} ms={audit.status === "live" ? 10000 : 3000} />
      <p className="sub"><Link href={`/app/p/${p.id}/chatbot`}>← All audits</Link></p>
      <Flash ok={sp.ok} error={sp.error} />
      <PageHeader
        title={audit.name}
        subtitle={`Graded by ${audit.judge ?? (audit.mode === "ai" ? "the AI judge" : "basic mode")} · ${total} answers${audit.status === "live" ? " · updates live" : ""}`}
        actions={total > 0 ? (
          <>
            <a className="btn btn-ghost btn-sm" href={`/app/p/${p.id}/chatbot/audit/${audit.id}/csv`}>⬇ CSV</a>
            {shareUrl ? (
              <>
                <a className="btn btn-ghost btn-sm" href={shareUrl} target="_blank" rel="noreferrer">📄 Client report / PDF</a>
                <CopyButton text={shareUrl} label="Copy share link" />
                <form action={shareAuditAction}><input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="auditId" value={audit.id} /><input type="hidden" name="revoke" value="1" /><SubmitButton className="btn btn-ghost btn-sm" pendingText="…">Stop sharing</SubmitButton></form>
              </>
            ) : (
              <form action={shareAuditAction}><input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="auditId" value={audit.id} /><SubmitButton className="btn btn-sm" pendingText="Creating…">🔗 Share client report</SubmitButton></form>
            )}
          </>
        ) : null}
      />

      {audit.status === "running" ? (
        <div className="card row"><span className="spin" /> <strong>Grading answers…</strong><span className="sub">This page updates automatically. Large files take a few minutes.</span></div>
      ) : null}
      {audit.status === "failed" ? <div className="alert alert-bad"><strong>Audit failed:</strong> {audit.error}</div> : null}

      {audit.status === "done" || audit.status === "live" ? (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div className="card" style={{ display: "grid", placeItems: "center" }}>
              <ScoreRing score={audit.score == null ? null : Math.round(audit.score)} label="Accuracy score" />
            </div>
            <div className="card">
              <h3>Verdicts</h3>
              <HBars rows={VERDICTS.map((v) => ({ label: VERDICT_LABELS[v], value: counts.find((c) => c.verdict === v)?.n ?? 0, color: VERDICT_COLOR[v] }))} />
            </div>
            <div className="card">
              <h3>Teach the AI</h3>
              <p className="sub">Mark verdicts right or wrong below. After {MIN_TRAINING_LABELS} reviews, train your own neural risk model in Settings.</p>
              <div className="progress"><span style={{ width: `${Math.min(100, (reviewed / Math.max(1, total)) * 100)}%` }} /></div>
              <p className="faint" style={{ marginTop: 6 }}>{reviewed} of {total} reviewed</p>
            </div>
          </div>

          {risk.high + risk.medium > 0 || flagTotal > 0 || safetyTotal > 0 ? (
            <div className="card">
              <h3>⚠️ Business risk found</h3>
              <div className="grid grid-4">
                <div className="stat"><span className="stat-label">Could create legal or financial exposure</span><span className="stat-value" style={{ color: risk.high ? "var(--bad)" : undefined }}>{risk.high}</span><span className="stat-foot">high-risk answers{risk.statedAsFact ? ` · ${risk.statedAsFact} wrong answer${risk.statedAsFact === 1 ? "" : "s"} stated as fact` : ""}</span></div>
                <div className="stat"><span className="stat-label">Misled or frustrated customers</span><span className="stat-value">{risk.medium}</span><span className="stat-foot">medium-risk answers</span></div>
                <div className="stat"><span className="stat-label">Conversation problems</span><span className="stat-value">{flagTotal}</span>
                  <span className="stat-foot">{flagEntries.filter(([f, n]) => n && !isSafetyFlag(f)).map(([f, n]) => `${FLAG_LABELS[f]} × ${n}`).join(" · ") || "none"}</span></div>
                <div className="stat"><span className="stat-label">Safety &amp; security</span><span className="stat-value" style={{ color: safetyTotal ? "var(--bad)" : undefined }}>{safetyTotal}</span>
                  <span className="stat-foot">{flagEntries.filter(([f, n]) => n && isSafetyFlag(f)).map(([f, n]) => `${FLAG_LABELS[f]} × ${n}`).join(" · ") || "none"}</span></div>
              </div>
            </div>
          ) : null}

          <div className="card" id="fixes">
            <div className="card-head">
              <div><h3>📋 Fix list</h3><span className="sub">Fix these first: help articles to update, and bot prompt, memory or hand-over problems for your developer.</span></div>
              <Badge tone={problems ? "bad" : "ok"}>{problems} problem answer{problems === 1 ? "" : "s"}</Badge>
            </div>
            {fixes.length === 0 ? <p className="sub">🎉 No problems found in this audit.</p> : (
              <div className="grid grid-2">
                {fixes.slice(0, 8).map((f, i) => (
                  <div key={f.doc} className="card" style={{ boxShadow: "none" }}>
                    <div className="row between" style={{ flexWrap: "nowrap" }}>
                      <strong>{i + 1}. {f.doc}</strong>
                      <Badge tone={f.high ? "bad" : "warn"}>{f.count} answer{f.count > 1 ? "s" : ""}</Badge>
                    </div>
                    <div className="row" style={{ margin: "8px 0" }}>
                      {(Object.entries(f.verdicts) as [Verdict, number][]).map(([v, n]) => <span key={v} className="badge">{VERDICT_LABELS[v]} × {n}</span>)}
                    </div>
                    {f.examples.slice(0, 2).map((e, j) => (
                      <p key={j} className="sub" style={{ marginBottom: 6 }}>“{e.question.slice(0, 120)}” → {e.reason}</p>
                    ))}
                    {canEdit && !fixBlocked ? (
                      isBehaviourGroup(f.doc) ? (
                        <a href="#safe-prompt" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}>🛡️ Fix with a safe system prompt ↓</a>
                      ) : (
                        <form action={fixWithAiAction} style={{ marginTop: 6 }}>
                          <input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="auditId" value={audit.id} /><input type="hidden" name="doc" value={f.doc} />
                          <SubmitButton className="btn btn-sm" pendingText="✨ Writing the fix… (about 30 s)">{articleFixes.get(f.doc) ? "↻ Rewrite with AI" : "✨ Fix with AI"}</SubmitButton>
                        </form>
                      )
                    ) : null}
                    {articleFixes.get(f.doc) ? <ArticleFix fix={articleFixes.get(f.doc)!} projectId={p.id} auditId={audit.id} canEdit={canEdit} /> : null}
                  </div>
                ))}
              </div>
            )}
            {fixBlocked && fixes.length ? <p className="hint" style={{ marginTop: 10 }}>✨ {fixBlocked}</p> : null}
          </div>
          {fixes.length ? <SafePromptCard fix={promptFix} projectId={p.id} back={base} canEdit={canEdit} aiOff={fixBlocked} /> : null}
        </>
      ) : null}

      {total > 0 ? (
        <div className="card">
          <div className="card-head">
            <h3>Answers</h3>
            <div className="tabs" style={{ margin: 0 }}>
              <Link className={`tab ${sort === "risk" ? "active" : ""}`} href={qs({ sort: "risk" })}>Highest risk first</Link>
              <Link className={`tab ${sort === "order" ? "active" : ""}`} href={qs({ sort: "order" })}>Original order</Link>
            </div>
          </div>
          <div className="tabs">
            <Link className={`tab ${filter === "problems" ? "active" : ""}`} href={qs({ v: "problems" })}>All problems ({problems})</Link>
            <Link className={`tab ${filter === "frustrated" ? "active" : ""}`} href={qs({ v: "frustrated" })}>😠 Frustrated customers ({frustrated})</Link>
            <Link className={`tab ${filter === "conversation" ? "active" : ""}`} href={qs({ v: "conversation" })}>🔁 Conversation problems ({flagTotal})</Link>
            <Link className={`tab ${filter === "safety" ? "active" : ""}`} href={qs({ v: "safety" })}>🛡️ Safety ({safetyTotal})</Link>
            {risk.statedAsFact ? <Link className={`tab ${filter === "fact" ? "active" : ""}`} href={qs({ v: "fact" })} title="Wrong answers the bot said with full confidence, the ones customers don't double-check">📢 Stated as fact ({risk.statedAsFact})</Link> : null}
            {VERDICTS.map((v) => (
              <Link key={v} className={`tab ${filter === v ? "active" : ""}`} href={qs({ v })}>{VERDICT_LABELS[v]} ({counts.find((c) => c.verdict === v)?.n ?? 0})</Link>
            ))}
          </div>
          {items.length === 0 ? <Empty icon="✅" title="Nothing here">No answers match this filter.</Empty> : (
            <div className="stack">
              {items.map((it) => {
                const shown = it.corrected_verdict ?? it.verdict;
                return (
                  <div key={it.id} id={`item-${it.id}`} className="card" style={{ boxShadow: "none" }}>
                    <div className="row between">
                      <div className="row">
                        <VerdictBadge verdict={shown} />
                        {it.severity !== "none" && shown !== "correct" ? <SeverityBadge severity={it.severity} /> : null}
                        {it.risk != null ? <Badge tone={it.risk >= 0.7 ? "bad" : it.risk >= 0.4 ? "warn" : "ok"}>Risk {Math.round(it.risk * 100)}%</Badge> : null}
                        {it.frustrated ? <Badge tone="warn">😠 Frustrated customer</Badge> : null}
                        {it.rule_hit ? <Badge tone="bad">📏 Rule broken</Badge> : null}
                        {(it.conv_flags?.split(",") as ConvFlag[] | undefined)?.filter((f) => f !== "confident_wrong" || shown !== "correct").map((f) => <Badge key={f} tone={f === "attack_blocked" ? "ok" : FLAG_SEVERITY[f] === "high" ? "bad" : "warn"}>{f === "confident_wrong" ? "📢" : isSafetyFlag(f) ? "🛡️" : "🔁"} {FLAG_LABELS[f] ?? f}</Badge>)}
                        {it.latency_ms != null ? <Badge tone={it.latency_ms > 10000 ? "warn" : "muted"}>⏱ {(it.latency_ms / 1000).toFixed(1)}s</Badge> : null}
                        {it.bot_error ? <Badge tone="bad">⚠ Bot error</Badge> : null}
                        {it.feedback ? <Badge tone="brand">{it.feedback === "agree" ? "Reviewed ✓" : `Corrected (judge said ${VERDICT_LABELS[it.verdict]})`}</Badge> : null}
                      </div>
                      <span className="faint mono">#{it.conversation_id}</span>
                    </div>
                    <div className="grid grid-2" style={{ marginTop: 12 }}>
                      <div><div className="stat-label">Customer</div><div style={{ whiteSpace: "pre-wrap" }}>{it.question || <em className="faint">(no message)</em>}</div></div>
                      <div><div className="stat-label">Bot answer</div><div style={{ whiteSpace: "pre-wrap" }}>{it.answer}</div></div>
                    </div>
                    <p style={{ marginTop: 12, marginBottom: 8 }}><strong>Why:</strong> {it.reason}{it.source_doc ? <> <span className="sub">· Related article: <strong>{it.source_doc}</strong></span></> : null}</p>
                    {it.diagnosis ? (
                      <p className="sub" style={{ margin: "0 0 8px" }}>🔎 <strong>{DIAGNOSIS_TEXT[it.diagnosis].label}:</strong> {DIAGNOSIS_TEXT[it.diagnosis].text}</p>
                    ) : null}
                    {it.evidence ? (
                      <blockquote className="evidence">
                        <span className="sub">📄 Your help article{it.source_doc ? <> <strong>{it.source_doc}</strong></> : null} says:</span> &ldquo;{it.evidence}&rdquo;
                        <form action={addItemToTestsAction} style={{ display: "inline", marginLeft: 8 }}>
                          <input type="hidden" name="projectId" value={p.id} />
                          <input type="hidden" name="itemId" value={it.id} />
                          <button className="btn btn-ghost btn-sm" title="Ask your bot this question every night (and in CI) and check the answer includes this fact">🧪 Add to tests</button>
                        </form>
                      </blockquote>
                    ) : null}
                    <form action={feedbackAction} className="row">
                      <input type="hidden" name="projectId" value={p.id} />
                      <input type="hidden" name="auditId" value={audit.id} />
                      <input type="hidden" name="itemId" value={it.id} />
                      <input type="hidden" name="back" value={qs({ page })} />
                      <span className="sub">Is this verdict right?</span>
                      <button name="choice" value="agree" className="btn btn-ghost btn-sm">👍 Yes</button>
                      {it.feedback ? <button name="choice" value="clear" className="btn btn-ghost btn-sm">Undo</button> : null}
                      <select name="choice" defaultValue="" aria-label="Correct verdict" style={{ width: "auto" }}>
                        <option value="" disabled>👎 No, it should be…</option>
                        {VERDICTS.filter((v) => v !== it.verdict).map((v) => <option key={v} value={v}>{VERDICT_LABELS[v]}</option>)}
                      </select>
                      <SubmitButton className="btn btn-ghost btn-sm" pendingText="Saving…">Save correction</SubmitButton>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
          {pages > 1 ? (
            <div className="row" style={{ marginTop: 14, justifyContent: "center" }}>
              {page > 1 ? <Link className="btn btn-ghost btn-sm" href={qs({ page: page - 1 })}>← Previous</Link> : null}
              <span className="sub">Page {page} of {pages}</span>
              {page < pages ? <Link className="btn btn-ghost btn-sm" href={qs({ page: page + 1 })}>Next →</Link> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
