import crypto from "node:crypto";
import { all, get, run } from "./db";
import { raiseIncident, resolveIncidents } from "./incidents";
import { importFromWebsite } from "./kbimport";
import { truncate } from "./text";

/**
 * Policy drift: the client changes their returns page, the bot (and its knowledge base) keep the old version, and
 * every answer is "correct" against a policy that is no longer true. Help articles imported from a website are
 * re-read daily; when the live page changes in a meaningful way, the owner is alerted with what changed and can
 * update the article in one click. Every graded answer records which version of its article it was checked against.
 */

const DAY_MS = 86400000;
const MAX_PER_RUN = 10;

type Fetcher = Parameters<typeof importFromWebsite>[1]["fetcher"];

export const SOURCE_SUFFIX = /\n\nSource: (https?:\/\/\S+)\s*$/;
export const withoutSource = (content: string) => content.replace(SOURCE_SUFFIX, "");
export const sourceOf = (content: string) => content.match(SOURCE_SUFFIX)?.[1] ?? null;
const norm = (s: string) => withoutSource(s).replace(/\s+/g, " ").trim();
const hash = (s: string) => crypto.createHash("sha256").update(norm(s)).digest("hex");

function sentences(text: string): string[] {
  return norm(text).split(/(?<=[.!?])\s+|\s*[•·|]\s*/).map((s) => s.trim()).filter(Boolean);
}
// Text that changes on every page load or every year without the policy changing.
const NOISE = /^(?:©|copyright|last updated|updated on|all rights reserved)|\b(?:cookie|cookies)\b|^\W*\d{1,4}([\/.-]\d{1,4}){0,2}\W*$/i;

/** Sentences removed from and added to a page, ignoring footers, dates and other noise. */
export function policyDiff(oldText: string, newText: string): { removed: string[]; added: string[] } {
  const keep = (s: string) => s.split(/\s+/).length >= 4 && !NOISE.test(s);
  const a = sentences(oldText).filter(keep), b = sentences(newText).filter(keep);
  const inA = new Set(a), inB = new Set(b);
  return { removed: a.filter((s) => !inB.has(s)), added: b.filter((s) => !inA.has(s)) };
}

export function describeDiff(d: { removed: string[]; added: string[] }): string {
  const parts: string[] = [];
  if (d.removed[0]) parts.push(`Was: "${truncate(d.removed[0], 160)}"`);
  if (d.added[0]) parts.push(`Now: "${truncate(d.added[0], 160)}"`);
  const more = Math.max(d.removed.length, d.added.length) - 1;
  return parts.join(" ") + (more > 0 ? ` (+${more} more change${more === 1 ? "" : "s"})` : "");
}

interface Doc { id: number; title: string; content: string; source_url: string | null; version: number; pending_hash: string | null; dismissed_hash: string | null }

/** Re-reads imported help pages not checked in the last day; alerts on meaningful changes. Returns pages that changed. */
export async function checkPolicyPages(projectId: number, opts: { fetcher?: Fetcher; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const due = all<Doc>(
    `SELECT id, title, content, source_url, version, pending_hash, dismissed_hash FROM kb_docs
      WHERE project_id = ? AND source_url IS NOT NULL AND (checked_at IS NULL OR checked_at < ?) ORDER BY COALESCE(checked_at, '') LIMIT ?`,
    projectId, new Date(now.getTime() - DAY_MS + 3600000).toISOString(), MAX_PER_RUN,
  );
  let changed = 0;
  for (const d of due) {
    let live: string;
    try {
      const [page] = await importFromWebsite(d.source_url!, { crawl: false, fetcher: opts.fetcher, deadlineMs: 15000 });
      live = page.content;
    } catch (err) {
      run("UPDATE kb_docs SET checked_at = ?, check_error = ? WHERE id = ?", now.toISOString(), truncate(err instanceof Error ? err.message : String(err), 200), d.id);
      continue;
    }
    run("UPDATE kb_docs SET checked_at = ?, check_error = NULL WHERE id = ?", now.toISOString(), d.id);
    const h = hash(live);
    if (h === hash(d.content)) {
      if (d.pending_hash) clearPending(projectId, d.id, d.pending_hash);
      continue;
    }
    if (h === d.pending_hash || h === d.dismissed_hash) continue;
    const diff = policyDiff(d.content, live);
    if (!diff.removed.length && !diff.added.length) continue; // only dates, footers or cookie text changed
    if (d.pending_hash) resolveIncidents(projectId, `policy:${d.id}:${d.pending_hash.slice(0, 12)}`);
    run("UPDATE kb_docs SET pending_content = ?, pending_hash = ?, pending_since = ? WHERE id = ?", live, h, now.toISOString(), d.id);
    const host = new URL(d.source_url!).hostname.replace(/^www\./, "");
    await raiseIncident(projectId, {
      module: "chatbot", code: "POLICY_CHANGED", severity: "medium",
      title: `"${d.title}" changed on ${host}`,
      detail: `The live page no longer matches your knowledge base (v${d.version}), so answers are being checked against the old policy, and your bot may still be quoting it. ${describeDiff(diff)}. Update the article in ProofMyAI (Chatbot audits → Knowledge base), and update your bot's knowledge too.`,
      dedupeKey: `policy:${d.id}:${h.slice(0, 12)}`,
    });
    changed++;
  }
  return changed;
}

function clearPending(projectId: number, docId: number, pendingHash: string) {
  run("UPDATE kb_docs SET pending_content = NULL, pending_hash = NULL, pending_since = NULL WHERE id = ?", docId);
  resolveIncidents(projectId, `policy:${docId}:${pendingHash.slice(0, 12)}`);
}

/** Replaces the article with the live page's new text, as the next version. */
export function acceptPolicyChange(projectId: number, docId: number): boolean {
  const d = get<{ content: string; pending_content: string | null; pending_hash: string | null; source_url: string | null }>(
    "SELECT content, pending_content, pending_hash, source_url FROM kb_docs WHERE id = ? AND project_id = ?", docId, projectId,
  );
  if (!d?.pending_content || !d.pending_hash) return false;
  run("UPDATE kb_docs SET content = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?",
    `${d.pending_content}${d.source_url ? `\n\nSource: ${d.source_url}` : ""}`, docId);
  clearPending(projectId, docId, d.pending_hash);
  return true;
}

/** Keeps the current article; this exact change won't be alerted again. */
export function dismissPolicyChange(projectId: number, docId: number): boolean {
  const d = get<{ pending_hash: string | null }>("SELECT pending_hash FROM kb_docs WHERE id = ? AND project_id = ?", docId, projectId);
  if (!d?.pending_hash) return false;
  run("UPDATE kb_docs SET dismissed_hash = ? WHERE id = ?", d.pending_hash, docId);
  clearPending(projectId, docId, d.pending_hash);
  return true;
}

/** The version of the article an answer was checked against. */
export function articleVersion(projectId: number, title: string | null): number | null {
  if (!title) return null;
  return get<{ v: number }>("SELECT version AS v FROM kb_docs WHERE project_id = ? AND title = ? ORDER BY id DESC LIMIT 1", projectId, title)?.v ?? null;
}
