import { beforeEach, describe, expect, it } from "vitest";
import { storeGradedItem } from "@/lib/audit/run";
import { all, get, run } from "@/lib/db";
import { buildKbIndex } from "@/lib/judge/features";
import { acceptPolicyChange, checkPolicyPages, dismissPolicyChange, policyDiff } from "@/lib/policywatch";
import { highlights, valueNumbers } from "@/lib/valuereport";
import { freshDb } from "./helpers";

let projectId: number;
beforeEach(() => ({ projectId } = freshDb()));

const OLD = "You can return any item within 30 days of delivery for a full refund. Items must be unused and in the original packaging. Sale items can be returned for store credit only. Refunds take up to 5 business days.";
const NEW = "You can return any item within 14 days of delivery for a full refund. Items must be unused and in the original packaging. Sale items can be returned for store credit only. Refunds take up to 5 business days.";
let page = OLD;
const html = (body: string, year = 2026) => `<html><head><title>Returns policy</title></head><body><main><p>${body}</p></main><footer>© ${year} Acme</footer></body></html>`;
const fetcher = (async () => new Response(html(page), { headers: { "content-type": "text/html" } })) as never;
const later = (days: number) => new Date(Date.now() + days * 86400000);

function addImportedDoc(): number {
  return Number(run("INSERT INTO kb_docs (project_id, title, content, source_url, checked_at) VALUES (?, 'Returns policy', ?, 'https://shop.example/returns', ?)",
    projectId, `${OLD}\n\nSource: https://shop.example/returns`, new Date().toISOString()).lastInsertRowid);
}
const incidents = () => all<{ title: string; detail: string; resolved: number }>("SELECT title, detail, resolved FROM incidents WHERE code = 'POLICY_CHANGED'");

describe("policy drift", () => {
  beforeEach(() => { page = OLD; });

  it("diffs sentences and ignores footers and dates", () => {
    expect(policyDiff(OLD, NEW)).toEqual({ removed: [OLD.split(". ")[0] + "."], added: [NEW.split(". ")[0] + "."] });
    expect(policyDiff(`${OLD} © 2025 Acme Ltd`, `${OLD} © 2026 Acme Ltd`)).toEqual({ removed: [], added: [] });
  });

  it("re-reads the page daily, alerts once on a real change, and updates to the next version on accept", async () => {
    const id = addImportedDoc();
    expect(await checkPolicyPages(projectId, { fetcher })).toBe(0); // checked just now
    expect(await checkPolicyPages(projectId, { fetcher, now: later(1) })).toBe(0); // unchanged
    page = NEW;
    expect(await checkPolicyPages(projectId, { fetcher, now: later(2) })).toBe(1);
    expect(incidents()[0].title).toBe('"Returns policy" changed on shop.example');
    expect(incidents()[0].detail).toContain('Was: "You can return any item within 30 days');
    expect(incidents()[0].detail).toContain('Now: "You can return any item within 14 days');
    expect(await checkPolicyPages(projectId, { fetcher, now: later(3) })).toBe(0); // same change, no repeat

    expect(acceptPolicyChange(projectId, id)).toBe(true);
    const doc = get<{ version: number; content: string; pending_content: string | null }>("SELECT version, content, pending_content FROM kb_docs WHERE id = ?", id)!;
    expect(doc).toMatchObject({ version: 2, pending_content: null });
    expect(doc.content).toContain("within 14 days");
    expect(doc.content).toContain("Source: https://shop.example/returns");
    expect(incidents()[0].resolved).toBe(1);
    expect(await checkPolicyPages(projectId, { fetcher, now: later(4) })).toBe(0);
  });

  it("keeping the current version silences that exact change, and a page change back resolves the alert", async () => {
    const id = addImportedDoc();
    page = NEW;
    await checkPolicyPages(projectId, { fetcher, now: later(1) });
    expect(dismissPolicyChange(projectId, id)).toBe(true);
    expect(await checkPolicyPages(projectId, { fetcher, now: later(2) })).toBe(0);
    expect(get("SELECT version FROM kb_docs WHERE id = ?", id)).toEqual({ version: 1 });

    const id2 = addImportedDoc();
    await checkPolicyPages(projectId, { fetcher, now: later(3) });
    expect(get("SELECT pending_content IS NOT NULL AS p FROM kb_docs WHERE id = ?", id2)).toEqual({ p: 1 });
    page = OLD;
    await checkPolicyPages(projectId, { fetcher, now: later(4) });
    expect(get("SELECT pending_content FROM kb_docs WHERE id = ?", id2)).toEqual({ pending_content: null });
  });

  it("records an unreachable page without alerting", async () => {
    const id = addImportedDoc();
    const broken = (async () => new Response("gone", { status: 404 })) as never;
    expect(await checkPolicyPages(projectId, { fetcher: broken, now: later(2) })).toBe(0);
    expect(get<{ check_error: string }>("SELECT check_error FROM kb_docs WHERE id = ?", id)?.check_error).toContain("couldn't open");
  });

  it("stamps each graded answer with the article version, and counts changes in the client report", async () => {
    const id = addImportedDoc();
    run("UPDATE kb_docs SET version = 3 WHERE id = ?", id);
    const audit = Number(run("INSERT INTO audits (project_id, name, mode, status) VALUES (?, 'a', 'basic', 'done')", projectId).lastInsertRowid);
    const index = buildKbIndex([{ title: "Returns policy", content: OLD }]);
    storeGradedItem(audit, { conversationId: "c", turnIndex: 0, question: "Can I return?", answer: "Yes, within 30 days." },
      { turnIndex: 0, verdict: "correct", severity: "none", confidence: 0.8, reason: "ok", sourceDoc: "Returns policy" }, index, null, []);
    expect(get("SELECT kb_version FROM audit_items")).toEqual({ kb_version: 3 });

    page = NEW;
    await checkPolicyPages(projectId, { fetcher, now: later(2) });
    const v = valueNumbers(projectId, { from: new Date(Date.now() - 86400000), to: later(1), label: "x" });
    expect(v.policyChanges).toBe(1);
    expect(highlights(v)).toContain("1 policy change on the website caught, so the bot could be updated before quoting the old version");
  });
});
