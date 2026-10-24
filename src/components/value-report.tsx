import { durationLabel, money, type ValueReport } from "@/lib/valuereport";

const MODULE_LABEL: Record<string, string> = { chatbot: "Chatbot", tests: "Chatbot tests", agents: "AI agents", workflows: "Workflows", uptime: "Uptime", crm: "CRM", sheets: "Google Sheets" };

function Stat({ label, now, before, hint, good = "up", compare = true }: { label: string; now: number; before: number; hint?: string; good?: "up" | "down"; compare?: boolean }) {
  const diff = now - before;
  const tone = diff === 0 ? "sub" : (diff > 0) === (good === "up") ? "ok" : "warn";
  return (
    <div className="card value-stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{now.toLocaleString("en-GB")}</span>
      {compare ? <span className={tone === "sub" ? "sub" : `value-diff value-${tone}`}>{diff === 0 ? "same as before" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("en-GB")} vs before`}</span> : null}
      {hint ? <span className="sub" style={{ fontSize: 12 }}>{hint}</span> : null}
    </div>
  );
}

/** Proof-of-value report body, shared by the in-app page and the client link. */
export function ValueReportView({ r, brand, project }: { r: ValueReport; brand: string; project: string }) {
  const v = r.now, b = r.before;
  const watched = v.answersChecked + v.agentRunsWatched + v.workflowRunsWatched;
  const show = (a: number, c: number) => a > 0 || c > 0;
  // Nothing was watched in the earlier period (e.g. a new client), so "vs before" would be misleading.
  const compare = b.answersChecked + b.agentRunsWatched + b.workflowRunsWatched + b.problemsCaught + b.blockedBeforeSending > 0;
  return (
    <div className="value-report">
      <p className="sub" style={{ marginTop: 0 }}>{project} · {r.period.label} · {compare ? `compared with ${r.previous.label}` : "first report, nothing to compare with yet"} · prepared by {brand}</p>

      <div className="card value-hero">
        <h2 style={{ marginTop: 0 }}>What {brand} caught for you</h2>
        {r.highlights.length ? (
          <ul className="value-highlights">{r.highlights.map((h) => <li key={h}>✅ {h}</li>)}</ul>
        ) : watched ? (
          <p style={{ margin: 0 }}>✅ Everything ran cleanly: {watched.toLocaleString("en-GB")} answers, agent runs and workflow runs were checked and nothing needed action.</p>
        ) : (
          <p className="sub" style={{ margin: 0 }}>Nothing was checked in this period yet. Connect a chatbot, agent or workflow to start building this report.</p>
        )}
      </div>

      <h3>Prevented before it reached a customer</h3>
      <div className="grid grid-3">
        <Stat compare={compare} label="Wrong replies blocked" now={v.blockedBeforeSending} before={b.blockedBeforeSending} hint="Stopped by the pre-send check" />
        <Stat compare={compare} label="Replies held for a person" now={v.heldForReview} before={b.heldForReview} hint="Checked by a person before sending" />
        <Stat compare={compare} label="Risky AI actions stopped" now={v.actionsRejected} before={b.actionsRejected} hint={v.rejectedValue.length ? `Worth ${v.rejectedValue.map(money).join(" + ")}` : "Rejected in Approvals"} />
      </div>

      <h3>Caught and fixed</h3>
      <div className="grid grid-3">
        <Stat compare={compare} label="Silent failures caught" now={v.silentFailures} before={b.silentFailures} hint="Looked fine, wasn't working" />
        <Stat compare={compare} label="Problem chatbot answers found" now={v.problemAnswers} before={b.problemAnswers} hint={`${v.highRiskAnswers} high risk`} good="down" />
        <Stat compare={compare} label="Problems fixed" now={v.problemsResolved} before={b.problemsResolved} hint={v.medianFixMinutes != null ? `Typical time to fix: ${durationLabel(v.medianFixMinutes)}` : `${v.problemsCaught} caught in total`} />
        {show(v.missedHandovers, b.missedHandovers) ? <Stat compare={compare} label="Conversations needing a person" now={v.missedHandovers} before={b.missedHandovers} hint="Spotted so the customer wasn't left stuck" good="down" /> : null}
        {show(v.agentRunsWithIssues, b.agentRunsWithIssues) ? <Stat compare={compare} label="Agent runs with problems" now={v.agentRunsWithIssues} before={b.agentRunsWithIssues} hint="Loops, tool errors, costs, empty results" good="down" /> : null}
        {show(v.actionsApproved, b.actionsApproved) ? <Stat compare={compare} label="AI actions approved by a person" now={v.actionsApproved} before={b.actionsApproved} hint="Checked, then allowed" /> : null}
      </div>

      <h3>Watched around the clock</h3>
      <div className="grid grid-3">
        <Stat compare={compare} label="Chatbot answers checked" now={v.answersChecked} before={b.answersChecked} />
        <Stat compare={compare} label="AI agent runs checked" now={v.agentRunsWatched} before={b.agentRunsWatched} />
        <Stat compare={compare} label="Workflow runs checked" now={v.workflowRunsWatched} before={b.workflowRunsWatched} />
      </div>

      {v.byModule.length ? (
        <p className="sub" style={{ marginTop: 14 }}>Problems caught by area: {v.byModule.map((m) => `${MODULE_LABEL[m.module] ?? m.module} ${m.count}`).join(" · ")}</p>
      ) : null}
      <p className="hint">Every number is a count of real events recorded by {brand}. Nothing is estimated.</p>
    </div>
  );
}
