import { beforeEach, describe, expect, it } from "vitest";
import { get, run } from "@/lib/db";
import { highlights, periodFor, revokeValueShare, valueNumbers, valueReport, valueShareToken } from "@/lib/valuereport";
import { freshDb } from "./helpers";

let projectId: number;
beforeEach(() => ({ projectId } = freshDb()));

const NOW = new Date("2026-10-24T12:00:00Z");
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86400000).toISOString();
const sqlAt = (daysAgo: number) => at(daysAgo).replace("T", " ").slice(0, 19);

function seed() {
  for (const [d, decision] of [[2, "block"], [3, "block"], [4, "review"], [40, "block"]] as const) {
    run("INSERT INTO presend_checks (project_id, decision, verdict, created_at) VALUES (?, ?, 'hallucination', ?)", projectId, decision, at(d));
  }
  const audit = Number(run("INSERT INTO audits (project_id, name, mode, status, created_at) VALUES (?, 'Live', 'live', 'done', ?)", projectId, sqlAt(20)).lastInsertRowid);
  for (const [verdict, severity, d] of [["correct", "low", 5], ["hallucination", "high", 5], ["should_escalate", "medium", 6], ["correct", "low", 45]] as const) {
    run("INSERT INTO audit_items (audit_id, conversation_id, turn_index, question, answer, verdict, severity, reason, confidence, features_json, created_at) VALUES (?, 'c', 0, 'q', 'a', ?, ?, 'r', 0.9, '{}', ?)", audit, verdict, severity, at(d));
  }
  run("INSERT INTO approvals (project_id, fingerprint, action, summary, status, auto, reason, decided_by, decided_at, amount, currency, created_at, expires_at) VALUES (?, 'f1', 'refund', 'Refund', 'rejected', 0, 'r', 'me@x.com', ?, 89, 'GBP', ?, ?)", projectId, at(1), at(1), at(-1));
  run("INSERT INTO approvals (project_id, fingerprint, action, summary, status, auto, reason, decided_by, decided_at, created_at, expires_at) VALUES (?, 'f2', 'crm', 'CRM', 'approved', 1, 'rule', 'rule', ?, ?, ?)", projectId, at(1), at(1), at(-1));
  run("INSERT INTO incidents (project_id, module, code, severity, title, detail, resolved, created_at, resolved_at) VALUES (?, 'workflows', 'SILENT_FAILURE', 'high', 't', 'd', 1, ?, ?)", projectId, sqlAt(3), sqlAt(3 - 40 / 1440));
  run("INSERT INTO incidents (project_id, module, code, severity, title, detail, resolved, created_at) VALUES (?, 'workflows', 'WORKFLOW_FAILED', 'medium', 't', 'd', 0, ?)", projectId, sqlAt(2));
  run("INSERT INTO workflow_runs (project_id, platform, workflow_id, workflow_name, execution_id, status, started_at, output_items) VALUES (?, 'n8n', 'w', 'Orders', 'e1', 'success', ?, 3)", projectId, at(1));
}

describe("proof of value report", () => {
  it("counts only real events in the period, from every source", () => {
    seed();
    const { period } = periodFor(undefined, NOW);
    expect(valueNumbers(projectId, period)).toMatchObject({
      blockedBeforeSending: 2, heldForReview: 1,
      answersChecked: 3, problemAnswers: 2, highRiskAnswers: 1, missedHandovers: 1,
      actionsRejected: 1, actionsApproved: 0, rejectedValue: [{ currency: "GBP", amount: 89 }],
      silentFailures: 1, workflowFailures: 2, problemsCaught: 2, problemsResolved: 1, medianFixMinutes: 40,
      workflowRunsWatched: 1,
    });
  });

  it("compares with the period before", () => {
    seed();
    const r = valueReport(projectId, undefined, NOW);
    expect(r.before.blockedBeforeSending).toBe(1);
    expect(r.before.answersChecked).toBe(1);
  });

  it("writes highlights only for things that happened, in plain English", () => {
    seed();
    const r = valueReport(projectId, undefined, NOW);
    expect(r.highlights).toEqual([
      "2 wrong replies stopped before reaching a customer",
      "1 reply held for a person to check before sending",
      "1 risky AI action stopped by a person (worth £89)",
      "1 silent failure caught: automations that looked fine but weren't doing their job",
      "1 high-risk chatbot answer found and flagged for fixing",
      "1 conversation that needed a person spotted",
      "1 problem fixed, typically within 40 min",
    ]);
    expect(highlights(valueNumbers(projectId, { from: new Date(0), to: new Date(1), label: "x" }))).toEqual([]);
  });

  it("supports calendar months", () => {
    const { period, previous } = periodFor("2026-09", NOW);
    expect(period.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(previous.label).toBe("August 2026");
    expect(periodFor("2026-10", NOW).period.to).toEqual(NOW); // the current month runs to today
  });

  it("creates, reuses and revokes the client link", () => {
    expect(valueShareToken(projectId, false)).toBeNull();
    const t = valueShareToken(projectId, true)!;
    expect(t).toMatch(/^[\w-]{20,}$/);
    expect(valueShareToken(projectId, true)).toBe(t);
    revokeValueShare(projectId);
    expect(get("SELECT value_share_token AS t FROM projects WHERE id = ?", projectId)).toEqual({ t: null });
  });
});
