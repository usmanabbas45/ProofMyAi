"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseTranscripts } from "@/lib/audit/parse";
import { createAudit, executeAudit, NOT_STORED } from "@/lib/audit/run";
import { customMatcher, redactConversations } from "@/lib/pii";
import { RETENTION_OPTIONS } from "@/lib/retention";
import { processLiveChat } from "@/lib/audit/live";
import { ingestAgentRun } from "@/lib/agents/ingest";
import { pollChatSource, type ChatSource } from "@/lib/connectors/twilio";
import { pollAnySource } from "@/lib/connectors";
import { INTERCOM_REGIONS, verifyIntercom, type IntercomRegion } from "@/lib/connectors/intercom";
import { recordWorkflowRun } from "@/lib/workflows/monitor";
import { CHANNEL_TYPES, channelsFor, confirmVerificationCode, deliver, MODULES, sendVerificationCode, validateChannel } from "@/lib/notify";
import { requireUser } from "@/lib/auth";
import { billingState, limitError } from "@/lib/billing";
import { all, get, run, transaction } from "@/lib/db";
import { resolveIncidents } from "@/lib/incidents";
import { htmlToText, importFromWebsite, type ImportedDoc } from "@/lib/kbimport";
import { checkMonitor, INTERVALS, type Monitor } from "@/lib/uptime";
import { checkSheet, FRESH_OPTIONS, sheetCsvUrl, STALE_OPTIONS, validTimeZone, type SheetWatch } from "@/lib/sheets";
import { createInvite, INVITE_DAYS, projectRole, removeMember, revokeInvite, setMemberRole } from "@/lib/team";
import { VERDICTS, type Verdict } from "@/lib/judge/types";
import { retrainRiskModel } from "@/lib/ml/risk";
import { AccessError, newApiKey, projectAccess, type Project } from "@/lib/projects";
import { parseMustInclude, RULE_KINDS } from "@/lib/rules";
import { assertPublicUrl, encrypt, randomToken, rateLimit } from "@/lib/security";
import { applyArticleFix, fixAvailability, generateArticleFix, generateSafePrompt } from "@/lib/fixes";
import { JudgeError } from "@/lib/judge/llm";
import { renderBody, runSuite } from "@/lib/tests/runner";
import { pollSource } from "@/lib/workflows/pollers";
import { revokeValueShare, valueShareToken } from "@/lib/valuereport";
import { isVerified, VERIFY_FIRST } from "@/lib/verify";
import { acceptSuggestions, dismissSuggestions, generateTestSuggestions } from "@/lib/testgen";
import { decideApproval } from "@/lib/approvals";
import { addHeartbeat, HEARTBEAT_EVERY } from "@/lib/heartbeats";
import { FOLLOWUP_OPTIONS, pollCrm, REQUIRED_OPTIONS, type CrmSource } from "@/lib/crm/monitor";
import { providerById } from "@/lib/crm/providers";
import { addWatch, backtest, WATCH_MODULES, type WatchModule } from "@/lib/watches";
import { translateWatch } from "@/lib/watchparse";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** The project for a form: editors and owners can change things; viewers get a friendly message instead. */
async function project(form: FormData, need: "editor" | "owner" = "editor"): Promise<Project> {
  const user = await requireUser();
  const id = Number(form.get("projectId"));
  try {
    return projectAccess(user.id, id, need).project;
  } catch (err) {
    if (err instanceof AccessError) redirect(`/app/p/${id}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }
}
/** Settings, alerts, API key, privacy and deletion: owner only. */
const ownerProject = (form: FormData) => project(form, "owner");

/** Unconfirmed accounts may only send email to their own address (stops sign-up spam). */
async function mayEmailOthers(to: string): Promise<boolean> {
  const user = await requireUser();
  return isVerified(user.id) || to.trim().toLowerCase() === user.email;
}

function str(form: FormData, key: string, max = 20000): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function done(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath(path.split("?")[0]);
  const q = new URLSearchParams(msg as Record<string, string>).toString();
  redirect(`${path}${q ? `${path.includes("?") ? "&" : "?"}${q}` : ""}`);
}

/** Where to go after a connect form: the Connect page when it sent the form, otherwise the module page. */
function backTo(form: FormData, projectId: number, fallback: string): string {
  const back = String(form.get("back") ?? "");
  return back.startsWith(`/app/p/${projectId}/connect`) && !/[\\\s]/.test(back) && !back.includes("//") ? back : fallback;
}

async function fileText(form: FormData, key: string): Promise<string> {
  const f = form.get(key);
  if (!(f instanceof File) || f.size === 0) return "";
  if (f.size > MAX_UPLOAD_BYTES) throw new Error(`"${f.name}" is larger than 8 MB. Split it into smaller files.`);
  return f.text();
}

// ---------- Knowledge base ----------

export async function addKbDocAction(form: FormData) {
  const p = await project(form);
  const path = `/app/p/${p.id}/chatbot`;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let added = 0;
  try {
    for (const f of files) {
      if (f.size > MAX_UPLOAD_BYTES) throw new Error(`"${f.name}" is larger than 8 MB.`);
      const raw = (await f.text()).trim();
      const isHtml = /\.html?$/i.test(f.name) || /^<(!doctype|html)/i.test(raw);
      const text = isHtml ? htmlToText(raw).text : raw;
      if (text) {
        run("INSERT INTO kb_docs (project_id, title, content) VALUES (?, ?, ?)", p.id, f.name.replace(/\.(txt|md|markdown|csv|html?)$/i, "").slice(0, 200), text);
        added++;
      }
    }
  } catch (err) {
    done(path, { error: err instanceof Error ? err.message : "Upload failed" });
  }
  const title = str(form, "title", 200);
  const content = str(form, "content", 500000);
  if (title && content) {
    run("INSERT INTO kb_docs (project_id, title, content) VALUES (?, ?, ?)", p.id, title, content);
    added++;
  }
  if (added === 0) done(path, { error: "Add a title and content, or upload .txt/.md files." });
  done(path, { ok: `Added ${added} help article${added > 1 ? "s" : ""} to the knowledge base.` });
}

export async function importKbUrlAction(form: FormData) {
  const p = await project(form);
  const path = `/app/p/${p.id}/chatbot`;
  let url = str(form, "url", 2000).trim();
  if (!url) done(path, { error: "Paste the link to your FAQ, help center or policy page." });
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!rateLimit(`kb-import:${p.id}`, 6, 3600000)) done(path, { error: "You've imported a lot this hour. Try again in a little while." });
  let docs: ImportedDoc[] = [];
  try {
    docs = await importFromWebsite(url, { crawl: form.get("crawl") === "on" });
  } catch (err) {
    done(path, { error: err instanceof Error && !/fetch|ECONN|ENOTFOUND|certificate|timeout|aborted/i.test(err.message) ? err.message : "We couldn't open that website. Check the link works in your browser and is public." });
  }
  const existing = new Set(all<{ content: string }>("SELECT content FROM kb_docs WHERE project_id = ?", p.id).map((d) => d.content));
  const fresh = docs.filter((d) => !existing.has(d.content));
  transaction(() => {
    for (const d of fresh) run("INSERT INTO kb_docs (project_id, title, content) VALUES (?, ?, ?)", p.id, d.title, `${d.content}\n\nSource: ${d.url}`);
  });
  const host = new URL(docs[0].url).hostname.replace(/^www\./, "");
  done(path, fresh.length
    ? { ok: `Imported ${fresh.length} page${fresh.length > 1 ? "s" : ""} from ${host}. Check the list below and remove anything that isn't a help or policy page.` }
    : { ok: `Those pages from ${host} are already in your knowledge base.` });
}

export async function deleteKbDocAction(form: FormData) {
  const p = await project(form);
  run("DELETE FROM kb_docs WHERE id = ? AND project_id = ?", Number(form.get("docId")), p.id);
  done(`/app/p/${p.id}/chatbot`, { ok: "Article removed." });
}

// ---------- Chatbot audits ----------

export async function startAuditAction(form: FormData) {
  const p = await project(form);
  const path = `/app/p/${p.id}/chatbot`;
  let conversations;
  try {
    const text = (await fileText(form, "file")) || str(form, "pasted", MAX_UPLOAD_BYTES);
    conversations = parseTranscripts(text);
    if (p.redact_pii) conversations = redactConversations(conversations, customMatcher(p.mask_terms));
  } catch (err) {
    done(path, { error: err instanceof Error ? err.message : "Could not read the transcripts." });
  }
  const over = limitError(p.user_id, "conversations", conversations.length);
  if (over) done(path, { error: `This file has ${conversations.length} conversations. ${over}` });
  const name = str(form, "name", 120) || `Audit ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const { id } = createAudit(p.id, name);
  void executeAudit(id, p.id, conversations); // runs in the background; the page auto-refreshes
  redirect(`${path}/audit/${id}`);
}

export async function deleteAuditAction(form: FormData) {
  const p = await project(form);
  run("DELETE FROM audits WHERE id = ? AND project_id = ?", Number(form.get("auditId")), p.id);
  done(`/app/p/${p.id}/chatbot`, { ok: "Audit deleted." });
}

export async function feedbackAction(form: FormData) {
  const p = await project(form);
  const itemId = Number(form.get("itemId"));
  const auditId = Number(form.get("auditId"));
  const owned = get("SELECT i.id FROM audit_items i JOIN audits a ON a.id = i.audit_id WHERE i.id = ? AND a.project_id = ?", itemId, p.id);
  if (!owned) done(`/app/p/${p.id}/chatbot`, { error: "Answer not found." });
  const choice = String(form.get("choice") ?? "");
  if (choice === "agree") {
    run("UPDATE audit_items SET feedback = 'agree', corrected_verdict = NULL WHERE id = ?", itemId);
  } else if ((VERDICTS as readonly string[]).includes(choice)) {
    run("UPDATE audit_items SET feedback = 'disagree', corrected_verdict = ? WHERE id = ?", choice as Verdict, itemId);
  } else if (choice === "clear") {
    run("UPDATE audit_items SET feedback = NULL, corrected_verdict = NULL WHERE id = ?", itemId);
  }
  const back = String(form.get("back") ?? "");
  revalidatePath(`/app/p/${p.id}/chatbot/audit/${auditId}`);
  redirect(`/app/p/${p.id}/chatbot/audit/${auditId}${back.startsWith("?") ? back : ""}#item-${itemId}`);
}

/**
 * Turns a real customer question into a regression test in one click: the expected fact is the sentence from the
 * help docs behind the verdict, so the nightly and CI tests check the bot keeps (or starts) getting it right.
 */
export async function addItemToTestsAction(form: FormData) {
  const p = await project(form);
  const itemId = Number(form.get("itemId"));
  const it = get<{ question: string; evidence: string | null; audit_id: number }>(
    "SELECT i.question, i.evidence, i.audit_id FROM audit_items i JOIN audits a ON a.id = i.audit_id WHERE i.id = ? AND a.project_id = ?", itemId, p.id,
  );
  if (!it || !it.evidence || it.question === NOT_STORED) done(`/app/p/${p.id}/chatbot`, { error: "This answer can't be turned into a test." });
  if (!get("SELECT 1 FROM test_cases WHERE project_id = ? AND question = ?", p.id, it.question)) {
    run("INSERT INTO test_cases (project_id, question, expected, must_not) VALUES (?, ?, ?, '')", p.id, it.question.slice(0, 2000), it.evidence);
  }
  done(`/app/p/${p.id}/tests`, { ok: `Added to your chatbot tests: "${it.question.slice(0, 80)}". A right answer must include: ${it.evidence.slice(0, 120)}` });
}

// ---------- Custom watches (plain English) ----------

const MAX_WATCHES = 25;

/** Back to the feature page the watch form was on (only this project's own pages). */
function watchBack(form: FormData, projectId: number): string {
  const back = String(form.get("back") ?? "");
  return back.startsWith(`/app/p/${projectId}/`) && !/[\\\s?#]/.test(back) && !back.includes("//") && !back.includes("..") ? back : `/app/p/${projectId}`;
}

function watchModule(form: FormData): WatchModule | null {
  const m = String(form.get("module") ?? "");
  return (WATCH_MODULES as readonly string[]).includes(m) ? (m as WatchModule) : null;
}

export async function addWatchAction(form: FormData) {
  const p = await project(form);
  const back = watchBack(form, p.id);
  const module = watchModule(form);
  const prompt = str(form, "prompt", 500);
  if (!module) done(back, { error: "Unknown feature." });
  if (prompt.length < 8) done(back, { error: "Describe what to watch, e.g. “Alert me if any workflow returns 0 items”." });
  if ((get<{ n: number }>("SELECT COUNT(*) AS n FROM watches WHERE project_id = ?", p.id)?.n ?? 0) >= MAX_WATCHES) done(back, { error: `You can have up to ${MAX_WATCHES} watches per project. Delete one first.` });
  if (!rateLimit(`watch-add:${p.id}`, 30, 3600000)) done(back, { error: "Too many new watches in an hour. Try again later." });
  const t = await translateWatch(p.id, module, prompt);
  if (!t.ok) done(back, { error: t.error });
  addWatch(p.id, module, prompt, t.spec);
  const would = backtest(p.id, module, t.spec);
  done(back, { ok: `Watching. ProofMyAI understood: ${t.spec.summary} In the last 7 days this would have alerted ${would} time${would === 1 ? "" : "s"}.` });
}

export async function deleteWatchAction(form: FormData) {
  const p = await project(form);
  const back = watchBack(form, p.id);
  const id = Number(form.get("watchId"));
  run("DELETE FROM watches WHERE id = ? AND project_id = ?", id, p.id);
  run("UPDATE incidents SET resolved = 1, resolved_at = datetime('now') WHERE project_id = ? AND dedupe_key = ? AND resolved = 0", p.id, `watch:${id}`);
  done(back, { ok: "Watch deleted." });
}

export async function toggleWatchAction(form: FormData) {
  const p = await project(form);
  const back = watchBack(form, p.id);
  run("UPDATE watches SET enabled = 1 - enabled, last_checked_at = ? WHERE id = ? AND project_id = ?", new Date().toISOString(), Number(form.get("watchId")), p.id);
  done(back, { ok: "Watch updated." });
}

// ---------- Custom rules ----------

export async function addRuleAction(form: FormData) {
  const p = await project(form);
  const kind = str(form, "kind");
  const pattern = str(form, "pattern", 200);
  const path = `/app/p/${p.id}/chatbot`;
  if (!(kind in RULE_KINDS)) done(path, { error: "Choose a rule type." });
  if (pattern.length < 2) done(path, { error: "Type the word or phrase for the rule (at least 2 characters)." });
  if (kind === "must_include" && !parseMustInclude(pattern)) done(path, { error: "Write this rule as: topic => required words, e.g. windscreen => not covered" });
  run("INSERT INTO rules (project_id, kind, pattern) VALUES (?, ?, ?)", p.id, kind, pattern);
  done(path, { ok: "Rule added. It applies to every new audit and every live answer." });
}

export async function deleteRuleAction(form: FormData) {
  const p = await project(form);
  run("DELETE FROM rules WHERE id = ? AND project_id = ?", Number(form.get("ruleId")), p.id);
  done(`/app/p/${p.id}/chatbot`, { ok: "Rule removed." });
}

// ---------- Client reports ----------

export async function shareAuditAction(form: FormData) {
  const p = await project(form);
  const auditId = Number(form.get("auditId"));
  const path = `/app/p/${p.id}/chatbot/audit/${auditId}`;
  if (!get("SELECT id FROM audits WHERE id = ? AND project_id = ?", auditId, p.id)) done(`/app/p/${p.id}/chatbot`, { error: "Audit not found." });
  if (form.get("revoke")) {
    run("UPDATE audits SET share_token = NULL WHERE id = ?", auditId);
    done(path, { ok: "Share link turned off. The old link no longer works." });
  }
  run("UPDATE audits SET share_token = ? WHERE id = ?", randomToken(18), auditId);
  done(path, { ok: "Share link created. Anyone with the link can view this report (read-only)." });
}

/** Turns the project's "Proof of value" client link on or off. */
export async function shareValueReportAction(form: FormData) {
  const p = await project(form);
  const path = `/app/p/${p.id}/value`;
  if (form.get("revoke")) {
    revokeValueShare(p.id);
    done(path, { ok: "Client link turned off. The old link no longer works." });
  }
  valueShareToken(p.id, true);
  done(path, { ok: "Client link created. Anyone with the link can view this report (read-only)." });
}

// ---------- Chatbot tests ----------

export async function addTargetAction(form: FormData) {
  const p = await project(form);
  const path = backTo(form, p.id, `/app/p/${p.id}/tests`);
  const name = str(form, "name", 120) || "My chatbot";
  const url = str(form, "url", 2000);
  const template = str(form, "body_template", 10000) || '{"message":"{{question}}"}';
  const responsePath = str(form, "response_path", 300);
  const headersRaw = str(form, "headers", 5000);
  const over = limitError(p.user_id, "bots");
  if (over) done(path, { error: over });
  try {
    await assertPublicUrl(url);
    if (!template.includes("{{question}}")) throw new Error("The request body must contain {{question}}.");
    renderBody(template, "test");
    let headersEnc: string | null = null;
    if (headersRaw) {
      const h = JSON.parse(headersRaw) as unknown;
      if (!h || typeof h !== "object" || Array.isArray(h) || Object.values(h).some((v) => typeof v !== "string")) {
        throw new Error('Headers must be a JSON object of strings, e.g. {"Authorization": "Bearer ..."}');
      }
      headersEnc = encrypt(JSON.stringify(h));
    }
    run("INSERT INTO bot_targets (project_id, name, url, headers_enc, body_template, response_path) VALUES (?, ?, ?, ?, ?, ?)",
      p.id, name, url, headersEnc, template, responsePath);
  } catch (err) {
    done(path, { error: err instanceof SyntaxError ? "Headers or body template is not valid JSON." : err instanceof Error ? err.message : "Invalid bot settings." });
  }
  done(path, { ok: `Bot "${name}" connected. Add test questions, then click Run tests.` });
}

export async function deleteTargetAction(form: FormData) {
  const p = await project(form);
  run("DELETE FROM bot_targets WHERE id = ? AND project_id = ?", Number(form.get("targetId")), p.id);
  done(`/app/p/${p.id}/tests`, { ok: "Bot removed." });
}

export async function addTestCaseAction(form: FormData) {
  const p = await project(form);
  const question = str(form, "question", 2000);
  const expected = str(form, "expected", 4000);
  if (!question || !expected) done(`/app/p/${p.id}/tests`, { error: "Question and expected facts are required." });
  run("INSERT INTO test_cases (project_id, question, expected, must_not) VALUES (?, ?, ?, ?)", p.id, question, expected, str(form, "must_not", 4000));
  done(`/app/p/${p.id}/tests`, { ok: "Test question added." });
}

export async function deleteTestCaseAction(form: FormData) {
  const p = await project(form);
  run("DELETE FROM test_cases WHERE id = ? AND project_id = ?", Number(form.get("caseId")), p.id);
  done(`/app/p/${p.id}/tests`, { ok: "Test question removed." });
}

export async function runTestsAction(form: FormData) {
  const p = await project(form);
  const targetId = Number(form.get("targetId"));
  const path = `/app/p/${p.id}/tests`;
  if (!get("SELECT id FROM bot_targets WHERE id = ? AND project_id = ?", targetId, p.id)) done(path, { error: "Bot not found." });
  let msg: { ok?: string; error?: string };
  try {
    const r = await runSuite(targetId);
    msg = r.failed ? { error: `${r.failed} test${r.failed > 1 ? "s" : ""} failed, ${r.passed} passed. See details below.` } : { ok: `All ${r.passed} tests passed.` };
  } catch (err) {
    msg = { error: err instanceof Error ? err.message : "Test run failed." };
  }
  done(path, msg);
}

// ---------- Workflows ----------

export async function addWorkflowSourceAction(form: FormData) {
  const p = await project(form);
  const path = backTo(form, p.id, `/app/p/${p.id}/workflows`);
  const platform = str(form, "platform") === "make" ? "make" : "n8n";
  const baseUrl = str(form, "base_url", 500).replace(/\/+$/, "");
  const apiKey = str(form, "api_key", 2000);
  const scenarios = str(form, "scenario_ids", 1000);
  const interval = Number(str(form, "expected_interval_min")) || null;
  const over = limitError(p.user_id, "monitors");
  if (over) done(path, { error: over });
  try {
    await assertPublicUrl(baseUrl);
    if (!apiKey) throw new Error("API key is required.");
    if (platform === "make" && !scenarios) throw new Error("Add at least one Make scenario ID.");
  } catch (err) {
    done(path, { error: err instanceof Error ? err.message : "Invalid settings." });
  }
  const { lastInsertRowid } = run(
    "INSERT INTO workflow_sources (project_id, platform, name, base_url, api_key_enc, scenario_ids, expected_interval_min) VALUES (?, ?, ?, ?, ?, ?, ?)",
    p.id, platform, str(form, "name", 120) || (platform === "n8n" ? "n8n" : "Make"), baseUrl, encrypt(apiKey), scenarios, interval,
  );
  const src = get<Parameters<typeof pollSource>[0]>("SELECT * FROM workflow_sources WHERE id = ?", lastInsertRowid)!;
  const result = await pollSource(src);
  done(path, result.error
    ? { error: `Saved, but the first check failed: ${result.error}. Fix the URL/key and click "Check now".` }
    : { ok: `Connected! Imported ${result.added} recent execution${result.added === 1 ? "" : "s"}.` });
}

export async function pollNowAction(form: FormData) {
  const p = await project(form);
  const src = get<Parameters<typeof pollSource>[0]>("SELECT * FROM workflow_sources WHERE id = ? AND project_id = ?", Number(form.get("sourceId")), p.id);
  if (!src) done(`/app/p/${p.id}/workflows`, { error: "Connection not found." });
  const r = await pollSource(src);
  done(`/app/p/${p.id}/workflows`, r.error ? { error: r.error } : { ok: `Checked. ${r.added} new execution${r.added === 1 ? "" : "s"}.` });
}

export async function deleteSourceAction(form: FormData) {
  const p = await project(form);
  run("DELETE FROM workflow_sources WHERE id = ? AND project_id = ?", Number(form.get("sourceId")), p.id);
  done(`/app/p/${p.id}/workflows`, { ok: "Connection removed." });
}

// ---------- Incidents ----------

export async function resolveIncidentAction(form: FormData) {
  const p = await project(form);
  const id = form.get("incidentId");
  if (id === "all") run("UPDATE incidents SET resolved = 1, resolved_at = datetime('now') WHERE project_id = ?", p.id);
  else run("UPDATE incidents SET resolved = 1, resolved_at = datetime('now') WHERE id = ? AND project_id = ?", Number(id), p.id);
  done(`/app/p/${p.id}/incidents`, { ok: "Marked as resolved." });
}

// ---------- Settings ----------

export async function updateSettingsAction(form: FormData) {
  const p = await ownerProject(form);
  const path = `/app/p/${p.id}/settings`;
  const webhook = str(form, "alert_webhook", 2000) || null;
  const email = str(form, "alert_email", 300) || null;
  try {
    if (webhook) await assertPublicUrl(webhook);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid weekly report email.");
    if (email && email !== p.alert_email && !(await mayEmailOthers(email))) throw new Error(VERIFY_FIRST);
  } catch (err) {
    done(path, { error: err instanceof Error ? err.message : "Invalid settings." });
  }
  const num = (k: string, fallback: number, min: number, max: number) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  run(
    `UPDATE projects SET name = ?, alert_webhook = ?, alert_email = ?, agent_cost_budget_usd = ?, agent_max_steps = ?, agent_max_ms = ?, agent_ai_review = ?,
       weekly_digest = ?, report_brand = ?, reply_timeout_sec = ? WHERE id = ?`,
    str(form, "name", 100) || p.name, webhook, email,
    num("agent_cost_budget_usd", p.agent_cost_budget_usd, 0.0001, 10000),
    Math.round(num("agent_max_steps", p.agent_max_steps, 1, 100000)),
    Math.round(num("agent_max_seconds", p.agent_max_ms / 1000, 1, 86400) * 1000),
    form.get("agent_ai_review") ? 1 : 0, form.get("weekly_digest") ? 1 : 0,
    str(form, "report_brand", 80) || null, Math.round(num("reply_timeout_sec", p.reply_timeout_sec, 0, 86400)), p.id,
  );
  done(path, { ok: "Settings saved." });
}

// ---------- Live tracking: test events and Twilio connector ----------

/**
 * Simulate a failure: sends one realistic broken event through the real pipeline (same checks, incidents and alert
 * channels as production), all on one trace, then opens the timeline so the customer sees exactly what was detected,
 * the evidence, and the alert they should have received. Names start with [Test] so they're easy to tell apart.
 */
export async function simulateFailureAction(form: FormData) {
  const p = await project(form);
  const stamp = Date.now().toString(36);
  const trace = `simulation-${stamp}`;
  const kind = String(form.get("kind") ?? "");
  if (kind === "silent") {
    await recordWorkflowRun(p.id, { platform: "other", workflow_id: "test-order-sync", workflow_name: "[Test] Order sync", execution_id: `sim-${stamp}`, status: "success", input_items: 25, output_items: 0, duration_ms: 1800, trace_id: trace });
  } else if (kind === "loop") {
    const step = { type: "tool" as const, name: "get_order", input: { id: "A-1" }, output: { error: "timeout" }, duration_ms: 900 };
    await ingestAgentRun(p.id, { run_id: `sim-${stamp}`, agent_name: "[Test] Refund agent", goal: "Refund order A-1", status: "success", final_output: "", trace_id: trace, steps: [step, step, step, step, step] });
  } else if (kind === "human") {
    await (await processLiveChat(p, { conversation_id: `sim-${stamp}`, bot_name: "[Test] Website bot", question: "Are you a real person?", answer: "Yes, I'm Sarah from the support team.", trace_id: trace }, { wait: true })).grades;
  } else {
    done(`/app/p/${p.id}/live`, { error: "Pick a failure to simulate." });
  }
  done(`/app/p/${p.id}/traces?t=${encodeURIComponent(trace)}`, { ok: "Simulated failure sent through the real checks. Below is what ProofMyAI detected. A [Test] incident was opened, and the alert went to your alert channels (WhatsApp, Slack, email…) if you've set them up." });
}

export async function sendTestEventAction(form: FormData) {
  const p = await project(form);
  const path = backTo(form, p.id, `/app/p/${p.id}/live`);
  const stamp = Date.now().toString(36);
  // A sample conversation where the bot asks again for a registration the customer already gave.
  await (await processLiveChat(p, {
    conversation_id: `test-${stamp}`, bot_name: "Test",
    messages: [
      { role: "user", content: "Hi, my car AB12 CDE won't start. Can someone help?" },
      { role: "assistant", content: "Sorry to hear that! What is your vehicle registration number?" },
    ],
    latency_ms: 1840, cost_usd: 0.0021,
  }, { wait: true })).grades;
  await ingestAgentRun(p.id, {
    run_id: `test-${stamp}`, agent_name: "Test agent", goal: "Summarise today's support tickets", status: "success",
    final_output: "3 tickets: 2 delivery questions, 1 refund request.",
    steps: [{ type: "llm", name: "summarise", tokens: 640, cost_usd: 0.003, duration_ms: 1200 }],
  });
  await recordWorkflowRun(p.id, { platform: "other", workflow_id: "test-workflow", workflow_name: "Test workflow", execution_id: `test-${stamp}`, status: "success", output_items: 5, duration_ms: 2300 });
  done(path, { ok: "Test events sent: a chatbot conversation (with a “asked again” problem), an agent run and a workflow run. They appear in the feed below." });
}

export async function addChatSourceAction(form: FormData) {
  const p = await project(form);
  const path = backTo(form, p.id, `/app/p/${p.id}/live`);
  const accountSid = str(form, "account_sid", 64);
  const keySid = str(form, "key_sid", 64);
  const secret = str(form, "secret", 200);
  const botNumber = str(form, "bot_number", 60).replace(/\s+/g, "");
  try {
    if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) throw new Error("The Account SID starts with AC and has 34 characters (Twilio Console → Account info).");
    if (keySid && !/^SK[0-9a-f]{32}$/i.test(keySid)) throw new Error("An API key SID starts with SK and has 34 characters.");
    if (!secret) throw new Error("Enter the API key secret (or the auth token).");
    if (!/^(whatsapp:)?\+\d{6,15}$/i.test(botNumber)) throw new Error("Enter the bot's number in international format, e.g. whatsapp:+14155238886 or +447700900123.");
  } catch (err) {
    done(path, { error: err instanceof Error ? err.message : "Invalid Twilio details." });
  }
  const { lastInsertRowid } = run(
    "INSERT INTO chat_sources (project_id, platform, name, account_id, secret_enc, bot_address) VALUES (?, 'twilio', ?, ?, ?, ?)",
    p.id, str(form, "name", 100) || "Twilio", accountSid, encrypt(JSON.stringify({ keySid: keySid || undefined, secret })), botNumber,
  );
  const src = get<ChatSource>("SELECT * FROM chat_sources WHERE id = ?", lastInsertRowid)!;
  const r = await pollChatSource(src);
  done(path, r.error
    ? { error: `Saved, but the first check failed: ${r.error}` }
    : { ok: `Connected! Imported ${r.replies} bot repl${r.replies === 1 ? "y" : "ies"} from the last 24 hours${r.waiting ? ` and ${r.waiting} unanswered customer message${r.waiting === 1 ? "" : "s"}` : ""}. New messages are checked every 15 minutes.` });
}

export async function pollChatSourceAction(form: FormData) {
  const p = await project(form);
  const src = get<ChatSource>("SELECT * FROM chat_sources WHERE id = ? AND project_id = ?", Number(form.get("sourceId")), p.id);
  if (!src) done(`/app/p/${p.id}/live`, { error: "Connection not found." });
  const r = await pollAnySource(src);
  done(`/app/p/${p.id}/live`, r.error ? { error: r.error } : { ok: `Checked: ${r.replies} new repl${r.replies === 1 ? "y" : "ies"}, ${r.waiting} waiting for a reply.` });
}

export async function deleteChatSourceAction(form: FormData) {
  const p = await project(form);
  run("DELETE FROM chat_sources WHERE id = ? AND project_id = ?", Number(form.get("sourceId")), p.id);
  done(`/app/p/${p.id}/live`, { ok: "Twilio connection removed." });
}

export async function updatePrivacyAction(form: FormData) {
  const p = await ownerProject(form);
  const days = Number(form.get("retention_days"));
  const terms = str(form, "mask_terms", 20000).split(/\r?\n/).map((t) => t.trim()).filter(Boolean).slice(0, 300).join("\n");
  run(
    "UPDATE projects SET redact_pii = ?, mask_terms = ?, retention_days = ?, store_text = ?, use_ai = ? WHERE id = ?",
    form.get("redact_pii") ? 1 : 0, terms || null,
    (RETENTION_OPTIONS as readonly number[]).includes(days) ? days : p.retention_days,
    form.get("store_text") ? 1 : 0, form.get("use_ai") ? 1 : 0, p.id,
  );
  done(`/app/p/${p.id}/settings`, { ok: "Privacy settings saved. They apply to new data from now on; old data is removed by the retention setting." });
}

export async function testAlertAction(form: FormData) {
  const p = await ownerProject(form);
  const path = `/app/p/${p.id}/alerts`;
  const only = Number(form.get("channelId")) || null;
  const channels = channelsFor(p.id).filter((c) => (only ? c.id === only : c.enabled !== 0 && !c.verify_hash));
  if (!channels.length) done(path, { error: only ? "Channel not found." : "Add an alert channel first (and turn it on)." });
  if (channels.some((c) => c.verify_hash)) done(path, { error: "Enter the WhatsApp code first to turn this channel on." });
  if (!rateLimit(`test-alert:${p.id}`, 10, 3600000)) done(path, { error: "Too many test alerts. Try again in an hour." });
  const msg = { projectId: p.id, projectName: p.name, kind: "problem" as const, module: "workflows", code: "TEST_ALERT", severity: "high" as const,
    title: "Test alert from ProofMyAI", detail: "If you can read this, alerts to this channel are working.", link: `${process.env.APP_URL ?? ""}/app/p/${p.id}/incidents` };
  const results = await Promise.allSettled(channels.map((c) => deliver(c, msg)));
  const failed: string[] = [];
  results.forEach((r, i) => {
    const status = r.status === "fulfilled" ? "ok" : String(r.reason instanceof Error ? r.reason.message : r.reason).slice(0, 200);
    if (r.status === "rejected") failed.push(`${CHANNEL_TYPES[channels[i].type].label}: ${status}`);
    run("UPDATE alert_channels SET last_status = ?, last_sent_at = ? WHERE id = ?", status, new Date().toISOString(), channels[i].id);
  });
  done(path, failed.length ? { error: `Some alerts failed. ${failed.join(" · ")}` } : { ok: "Test alert sent. Check your phone, inbox or channel." });
}

function channelRules(form: FormData): { sev: string; modules: string; resolved: number } {
  const sev = str(form, "min_severity");
  const modules = form.getAll("modules").map(String).filter((m) => (MODULES as readonly string[]).includes(m));
  return {
    sev: ["low", "medium", "high"].includes(sev) ? sev : "medium",
    modules: modules.length === 0 || modules.length === MODULES.length ? "" : modules.join(","),
    resolved: form.get("notify_resolved") ? 1 : 0,
  };
}

export async function addChannelAction(form: FormData) {
  const p = await ownerProject(form);
  const path = `/app/p/${p.id}/alerts`;
  let ch;
  try {
    ch = await validateChannel(str(form, "type"), str(form, "target", 2000), { token: str(form, "token", 300), sid: str(form, "sid", 64), from: str(form, "from", 40) });
    if (ch.type === "email" && !(await mayEmailOthers(ch.target))) throw new Error(VERIFY_FIRST);
  } catch (err) {
    done(path, { error: err instanceof Error ? err.message : "Invalid channel." });
  }
  if (channelsFor(p.id).length >= 20) done(path, { error: "A project can have up to 20 alert channels." });
  if (ch.type === "wa" && !rateLimit(`wa-code:${p.user_id}`, 5, 3600000)) done(path, { error: "Too many WhatsApp numbers added this hour. Try again later." });
  const r = channelRules(form);
  const label = str(form, "label", 60) || null;
  const { lastInsertRowid } = run(
    "INSERT INTO alert_channels (project_id, type, target, secret_enc, min_severity, modules, notify_resolved, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    p.id, ch.type, ch.target, ch.secret ? encrypt(ch.secret) : null, r.sev, r.modules, r.resolved, label,
  );
  if (ch.type === "wa") {
    try {
      await sendVerificationCode(lastInsertRowid);
    } catch (err) {
      run("DELETE FROM alert_channels WHERE id = ?", lastInsertRowid);
      console.error("[alerts] WhatsApp verification send failed:", err instanceof Error ? err.message : err);
      done(path, { error: `We couldn't send a WhatsApp message to ${ch.target} right now. Check the number, or try again in a few minutes (or pick another channel).` });
    }
    done(`${path}?verify=${lastInsertRowid}#ch-${lastInsertRowid}`, { ok: `We sent a 6-digit code to ${ch.target} on WhatsApp. Enter it below to turn on WhatsApp alerts.` });
  }
  done(`${path}#ch-${lastInsertRowid}`, { ok: `${CHANNEL_TYPES[ch.type].label} added. Click "Send test" to check it works.` });
}

export async function updateChannelAction(form: FormData) {
  const p = await ownerProject(form);
  const id = Number(form.get("channelId"));
  const r = channelRules(form);
  run("UPDATE alert_channels SET min_severity = ?, modules = ?, notify_resolved = ?, label = ? WHERE id = ? AND project_id = ?",
    r.sev, r.modules, r.resolved, str(form, "label", 60) || null, id, p.id);
  done(`/app/p/${p.id}/alerts#ch-${id}`, { ok: "Alert rules saved." });
}

export async function toggleChannelAction(form: FormData) {
  const p = await ownerProject(form);
  const id = Number(form.get("channelId"));
  const on = form.get("enabled") === "1";
  run("UPDATE alert_channels SET enabled = ? WHERE id = ? AND project_id = ?", on ? 1 : 0, id, p.id);
  done(`/app/p/${p.id}/alerts#ch-${id}`, { ok: on ? "Alerts resumed for this channel." : "Channel paused. It won't receive alerts until you resume it." });
}

export async function verifyChannelAction(form: FormData) {
  const p = await ownerProject(form);
  const id = Number(form.get("channelId"));
  const path = `/app/p/${p.id}/alerts`;
  if (!get("SELECT 1 FROM alert_channels WHERE id = ? AND project_id = ? AND type = 'wa'", id, p.id)) done(path, { error: "Channel not found." });
  if (!rateLimit(`wa-verify:${id}`, 8, 3600000)) done(`${path}?verify=${id}#ch-${id}`, { error: "Too many wrong codes. Ask for a new code in an hour." });
  if (form.get("resend")) {
    if (!rateLimit(`wa-code:${p.user_id}`, 5, 3600000)) done(`${path}?verify=${id}#ch-${id}`, { error: "Too many codes sent this hour. Try again later." });
    try {
      await sendVerificationCode(id);
    } catch (err) {
      console.error("[alerts] WhatsApp code resend failed:", err instanceof Error ? err.message : err);
      done(`${path}?verify=${id}#ch-${id}`, { error: "We couldn't send the code right now. Please try again in a few minutes." });
    }
    done(`${path}?verify=${id}#ch-${id}`, { ok: "New code sent on WhatsApp." });
  }
  if (!confirmVerificationCode(id, str(form, "code", 12))) done(`${path}?verify=${id}#ch-${id}`, { error: "That code is wrong or expired. Check WhatsApp or ask for a new code." });
  done(`${path}#ch-${id}`, { ok: "✅ WhatsApp alerts are on. Click \"Send test\" to try one." });
}

export async function deleteChannelAction(form: FormData) {
  const p = await ownerProject(form);
  run("DELETE FROM alert_channels WHERE id = ? AND project_id = ?", Number(form.get("channelId")), p.id);
  done(`/app/p/${p.id}/alerts`, { ok: "Alert channel removed." });
}

export async function regenerateKeyAction(form: FormData) {
  const p = await ownerProject(form);
  run("UPDATE projects SET api_key = ? WHERE id = ?", newApiKey(), p.id);
  done(`/app/p/${p.id}/settings`, { ok: "New API key created. Update it in your agents and workflows - the old key no longer works." });
}

export async function retrainAction(form: FormData) {
  const p = await ownerProject(form);
  const r = retrainRiskModel(p.id);
  done(`/app/p/${p.id}/settings`, r.ok
    ? { ok: `Neural model trained on ${r.samples} reviewed answers. Validation accuracy ${(r.valAccuracy * 100).toFixed(0)}% (judge alone: ${(r.baselineAccuracy * 100).toFixed(0)}%). Re-scored ${r.rescored} answers.` }
    : { error: r.reason });
}

export async function deleteProjectAction(form: FormData) {
  const p = await ownerProject(form);
  if (str(form, "confirm") !== p.name) done(`/app/p/${p.id}/settings`, { error: "Type the project name exactly to delete it." });
  run("DELETE FROM projects WHERE id = ?", p.id);
  redirect("/app?new=1");
}

// ---------- Uptime monitors ----------
export async function addMonitorAction(form: FormData) {
  const p = await project(form);
  const path = `/app/p/${p.id}/uptime`;
  const over = limitError(p.user_id, "uptime");
  if (over) done(path, { error: over });
  let url = str(form, "url", 2000);
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  const keyword = str(form, "keyword", 200) || null;
  let interval = Number(str(form, "interval_min")) || 5;
  if (!(INTERVALS as readonly number[]).includes(interval)) interval = 5;
  if (interval === 1 && billingState(p.user_id).plan.id === "free") interval = 5;
  try {
    await assertPublicUrl(url);
  } catch (err) {
    done(path, { error: err instanceof Error ? err.message : "Enter a valid public URL." });
  }
  const name = str(form, "name", 100) || new URL(url).hostname;
  const { lastInsertRowid } = run("INSERT INTO uptime_monitors (project_id, name, url, keyword, interval_min) VALUES (?, ?, ?, ?, ?)", p.id, name, url, keyword, interval);
  const m = get<Monitor>("SELECT * FROM uptime_monitors WHERE id = ?", lastInsertRowid)!;
  const r = await checkMonitor(m);
  done(path, r.ok
    ? { ok: `"${name}" is up (${r.ms} ms). It will be checked every ${interval} minute${interval === 1 ? "" : "s"}.` }
    : { error: `"${name}" was saved, but the first check failed: ${r.error}. You'll get an alert if the next check fails too.` });
}

export async function checkMonitorNowAction(form: FormData) {
  const p = await project(form);
  const m = get<Monitor>("SELECT * FROM uptime_monitors WHERE id = ? AND project_id = ?", Number(form.get("monitorId")), p.id);
  if (!m) done(`/app/p/${p.id}/uptime`, { error: "Monitor not found." });
  const r = await checkMonitor(m);
  done(`/app/p/${p.id}/uptime`, r.ok ? { ok: `${m.name} is up (${r.ms} ms).` } : { error: `${m.name}: ${r.error}` });
}

export async function deleteMonitorAction(form: FormData) {
  const p = await project(form);
  const id = Number(form.get("monitorId"));
  run("DELETE FROM uptime_monitors WHERE id = ? AND project_id = ?", id, p.id);
  resolveIncidents(p.id, `uptime:${id}`);
  done(`/app/p/${p.id}/uptime`, { ok: "Monitor removed." });
}

// ---------- Google Sheets watches ----------
const sheetsPath = (id: number) => `/app/p/${id}/sheets`;
const staleHours = (form: FormData) => {
  const h = Number(str(form, "stale_hours"));
  return (STALE_OPTIONS as readonly number[]).includes(h) ? h : 24;
};
/** Freshness check settings: [column, hours, time zone]. No column means the check is off. */
const freshness = (form: FormData): [string | null, number, string] => {
  const col = str(form, "fresh_col", 100) || null;
  const h = Number(str(form, "fresh_hours"));
  const tz = str(form, "fresh_tz", 64);
  return [col, col && (FRESH_OPTIONS as readonly number[]).includes(h) ? h : col ? 24 : 0, validTimeZone(tz) ? tz : "UTC"];
};

export async function addSheetAction(form: FormData) {
  const p = await project(form);
  const over = limitError(p.user_id, "monitors");
  if (over) done(sheetsPath(p.id), { error: over });
  const url = str(form, "url", 2000);
  const csvUrl = sheetCsvUrl(url);
  if (!csvUrl) done(sheetsPath(p.id), { error: "Paste the link of a Google Sheet (it starts with https://docs.google.com/spreadsheets/…)." });
  const name = str(form, "name", 100) || "Google Sheet";
  const requiredCol = str(form, "required_col", 100) || null;
  const { lastInsertRowid } = run(
    "INSERT INTO sheet_watches (project_id, name, url, csv_url, stale_hours, required_col, fresh_col, fresh_hours, fresh_tz) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    p.id, name, url, csvUrl!, staleHours(form), requiredCol, ...freshness(form),
  );
  const w = get<SheetWatch>("SELECT * FROM sheet_watches WHERE id = ?", lastInsertRowid)!;
  const r = await checkSheet(w);
  done(sheetsPath(p.id), r.error
    ? { error: `"${name}" was saved, but ProofMyAI couldn't read it yet: ${r.error}` }
    : { ok: `"${name}" is connected (${r.rows} row${r.rows === 1 ? "" : "s"}). It will be checked every 15 minutes.${r.problems.length ? ` Found right away: ${r.problems.join(", ")}.` : ""}` });
}

export async function updateSheetAction(form: FormData) {
  const p = await project(form);
  const id = Number(form.get("sheetId"));
  const [freshCol, freshHours, freshTz] = freshness(form);
  run(
    "UPDATE sheet_watches SET stale_hours = ?, required_col = ?, fresh_col = ?, fresh_hours = ?, fresh_tz = ?, newest_at = CASE WHEN ? IS NULL THEN NULL ELSE newest_at END WHERE id = ? AND project_id = ?",
    staleHours(form), str(form, "required_col", 100) || null, freshCol, freshHours, freshTz, freshCol, id, p.id,
  );
  if (!freshCol) resolveIncidents(p.id, `sheet:${id}:fresh`);
  done(sheetsPath(p.id), { ok: "Settings saved. They apply from the next check." });
}

export async function checkSheetNowAction(form: FormData) {
  const p = await project(form);
  const w = get<SheetWatch>("SELECT * FROM sheet_watches WHERE id = ? AND project_id = ?", Number(form.get("sheetId")), p.id);
  if (!w) done(sheetsPath(p.id), { error: "Sheet not found." });
  const r = await checkSheet(w!);
  done(sheetsPath(p.id), r.error ? { error: `${w!.name}: ${r.error}` } : r.problems.length ? { error: `${w!.name}: ${r.problems.join(", ")}.` } : { ok: `${w!.name} looks healthy (${r.rows} rows).` });
}

export async function deleteSheetAction(form: FormData) {
  const p = await project(form);
  const id = Number(form.get("sheetId"));
  run("DELETE FROM sheet_watches WHERE id = ? AND project_id = ?", id, p.id);
  for (const k of ["read", "stale", "errors", "blank", "fresh", "rows", "cols", "dupes"]) resolveIncidents(p.id, `sheet:${id}:${k}`);
  done(sheetsPath(p.id), { ok: "Sheet removed." });
}

// ---------- Team ----------
export async function inviteMemberAction(form: FormData) {
  const p = await ownerProject(form);
  const user = await requireUser();
  const path = `/app/p/${p.id}/team`;
  if (!isVerified(user.id)) done(path, { error: VERIFY_FIRST });
  const over = limitError(p.user_id, "seats");
  if (over) done(path, { error: over });
  const r = await createInvite(p, user.email, str(form, "email", 200), str(form, "role", 10), process.env.APP_URL || "");
  if (!r.ok) done(path, { error: r.error });
  done(path, r.emailed
    ? { ok: `Invitation emailed to ${str(form, "email", 200)}. It expires in ${INVITE_DAYS} days.` }
    : { ok: `Invitation created. Email isn't set up, so send them this link yourself: ${r.link}` });
}

export async function setMemberRoleAction(form: FormData) {
  const p = await ownerProject(form);
  setMemberRole(p.id, Number(form.get("userId")), str(form, "role", 10));
  done(`/app/p/${p.id}/team`, { ok: "Role updated." });
}

export async function removeMemberAction(form: FormData) {
  const p = await ownerProject(form);
  removeMember(p.id, Number(form.get("userId")));
  done(`/app/p/${p.id}/team`, { ok: "Member removed. They no longer have access." });
}

export async function revokeInviteAction(form: FormData) {
  const p = await ownerProject(form);
  revokeInvite(p.id, Number(form.get("inviteId")));
  done(`/app/p/${p.id}/team`, { ok: "Invitation cancelled." });
}

export async function leaveProjectAction(form: FormData) {
  const user = await requireUser();
  const id = Number(form.get("projectId"));
  if (projectRole(user.id, id) === "owner") redirect(`/app/p/${id}/team?error=${encodeURIComponent("Owners can't leave their own project.")}`);
  removeMember(id, user.id);
  redirect("/app?new=1");
}

// ---------- Intercom ----------
export async function addIntercomSourceAction(form: FormData) {
  const p = await project(form);
  const path = backTo(form, p.id, `/app/p/${p.id}/live`);
  const token = str(form, "token", 500);
  const region = (str(form, "region", 4) in INTERCOM_REGIONS ? str(form, "region", 4) : "us") as IntercomRegion;
  if (!token) done(path, { error: "Paste your Intercom access token." });
  let app: { appName: string; appId: string };
  try {
    app = await verifyIntercom(token, region);
  } catch (err) {
    done(path, { error: err instanceof Error ? err.message : "Couldn't reach Intercom." });
  }
  const { lastInsertRowid } = run(
    "INSERT INTO chat_sources (project_id, platform, name, account_id, secret_enc, bot_address) VALUES (?, 'intercom', ?, ?, ?, ?)",
    p.id, `Intercom · ${app.appName}`.slice(0, 100), app.appId, encrypt(JSON.stringify({ token })), region,
  );
  const src = get<ChatSource>("SELECT * FROM chat_sources WHERE id = ?", lastInsertRowid)!;
  const r = await pollAnySource(src);
  done(path, r.error
    ? { error: `Connected to ${app.appName}, but the first check failed: ${r.error}` }
    : { ok: `Connected to ${app.appName}! Checked ${r.replies} bot repl${r.replies === 1 ? "y" : "ies"} from the last 24 hours. New conversations are checked every 15 minutes.` });
}

// ---------- Fix with AI ----------
function fixGate(p: Project, path: string): void {
  const blocked = fixAvailability(p.id, p.user_id);
  if (blocked) done(path, { error: blocked });
  if (!rateLimit(`fix:${p.id}`, 20, 3600000)) done(path, { error: "That's a lot of fixes in one hour. Please wait a little and try again." });
}

const fixError = (err: unknown) => (err instanceof JudgeError || err instanceof Error ? err.message : "The AI couldn't write this fix. Try again.");

export async function fixWithAiAction(form: FormData) {
  const p = await project(form);
  const auditId = Number(form.get("auditId"));
  const doc = str(form, "doc", 300);
  const path = `/app/p/${p.id}/chatbot/audit/${auditId}`;
  if (!get("SELECT 1 FROM audits WHERE id = ? AND project_id = ?", auditId, p.id)) done(path, { error: "Audit not found." });
  fixGate(p, path);
  let fixId = 0;
  try {
    fixId = (await generateArticleFix(p.id, auditId, doc)).id;
  } catch (err) {
    done(path, { error: fixError(err) });
  }
  revalidatePath(path);
  redirect(`${path}#fix-${fixId}`);
}

export async function safePromptAction(form: FormData) {
  const p = await project(form);
  const back = str(form, "back", 300);
  const path = back.startsWith(`/app/p/${p.id}/`) && !back.includes("//") ? back.split("#")[0] : `/app/p/${p.id}/chatbot`;
  fixGate(p, path);
  try {
    await generateSafePrompt(p.id);
  } catch (err) {
    done(path, { error: fixError(err) });
  }
  revalidatePath(path.split("?")[0]);
  redirect(`${path.split("?")[0]}#safe-prompt`);
}

export async function applyFixAction(form: FormData) {
  const p = await project(form);
  const auditId = Number(form.get("auditId"));
  const path = `/app/p/${p.id}/chatbot/audit/${auditId}`;
  try {
    const { title } = applyArticleFix(p.id, Number(form.get("fixId")));
    done(path, { ok: `Saved “${title}” to your knowledge base. Future checks use the corrected article. Remember to update it in your own chatbot too.` });
  } catch (err) {
    if (err instanceof Error && err.message === "Fix not found.") done(path, { error: err.message });
    throw err;
  }
}

// ---------- Auto test generator ----------
export async function generateTestsAction(form: FormData) {
  const p = await project(form);
  const path = `/app/p/${p.id}/tests`;
  fixGate(p, path);
  let added = 0;
  try {
    added = await generateTestSuggestions(p.id);
  } catch (err) {
    done(path, { error: fixError(err) });
  }
  done(`${path}#suggested`, added
    ? { ok: `✨ ${added} test question${added === 1 ? "" : "s"} suggested. Check them below and click “Add” on the ones you want.` }
    : { error: "No new test questions this time: your tests already cover your help articles. Add more articles or wait for new chats." });
}

export async function acceptSuggestionsAction(form: FormData) {
  const p = await project(form);
  const id = Number(form.get("suggestionId"));
  const n = acceptSuggestions(p.id, id ? [id] : null);
  done(`/app/p/${p.id}/tests`, { ok: `${n} test question${n === 1 ? "" : "s"} added. They run every night with your other tests.` });
}

export async function dismissSuggestionsAction(form: FormData) {
  const p = await project(form);
  const id = Number(form.get("suggestionId"));
  dismissSuggestions(p.id, id ? [id] : null);
  done(`/app/p/${p.id}/tests`, { ok: id ? "Suggestion dismissed." : "All suggestions dismissed." });
}

// ---------- Approvals (human in the loop) ----------
const approvalsPath = (id: number) => `/app/p/${id}/approvals`;

export async function decideApprovalAction(form: FormData) {
  const p = await project(form);
  const user = await requireUser();
  const choice = str(form, "choice");
  if (choice !== "approve" && choice !== "approve_rule" && choice !== "reject") done(approvalsPath(p.id), { error: "Pick approve or reject." });
  const a = await decideApproval(p.id, Number(form.get("approvalId")), choice as "approve" | "approve_rule" | "reject", user.email, str(form, "note", 500) || null);
  if (!a) done(approvalsPath(p.id), { error: "This request was already decided or has expired." });
  done(approvalsPath(p.id), { ok: a!.status === "approved" ? (choice === "approve_rule" ? `Approved, and "${a!.category}" will be approved automatically from now on.` : "Approved. Your agent can go ahead.") : "Rejected. If the agent tries again, it will be blocked." });
}

export async function addApprovalRuleAction(form: FormData) {
  const p = await project(form);
  const user = await requireUser();
  const category = str(form, "category", 200).toLowerCase();
  const action = str(form, "action", 100).toLowerCase();
  if (category && action) run("INSERT OR IGNORE INTO approval_rules (project_id, category, action, created_by) VALUES (?, ?, ?, ?)", p.id, category, action, user.email);
  done(approvalsPath(p.id), { ok: `"${action}" for "${category}" is now approved automatically.` });
}

export async function deleteApprovalRuleAction(form: FormData) {
  const p = await project(form);
  run("DELETE FROM approval_rules WHERE project_id = ? AND category = ? AND action = ?", p.id, str(form, "category", 200), str(form, "action", 100));
  done(approvalsPath(p.id), { ok: "Rule removed. These actions need approval again." });
}

export async function approvalLimitAction(form: FormData) {
  const p = await project(form, "owner");
  const raw = str(form, "approve_over", 20);
  const v = raw === "" ? null : Number(raw);
  run("UPDATE projects SET approve_over = ? WHERE id = ?", v != null && Number.isFinite(v) && v >= 0 ? v : null, p.id);
  done(approvalsPath(p.id), { ok: v == null ? "Amount limit removed." : `Actions of ${v} or more now need approval.` });
}

// ---------- Heartbeats ----------
export async function addHeartbeatAction(form: FormData) {
  const p = await project(form);
  const back = `/app/p/${p.id}/workflows`;
  const over = limitError(p.user_id, "uptime");
  if (over) done(back, { error: over });
  const every = Number(str(form, "every_min"));
  const name = str(form, "name", 100);
  if (!name) done(back, { error: "Give the job a name." });
  addHeartbeat(p.id, name, (HEARTBEAT_EVERY as readonly number[]).includes(every) ? every : 60);
  done(back, { ok: `Heartbeat added. Copy its URL and call it at the end of "${name}".` });
}

export async function deleteHeartbeatAction(form: FormData) {
  const p = await project(form);
  const id = Number(form.get("hbId"));
  run("DELETE FROM job_heartbeats WHERE id = ? AND project_id = ?", id, p.id);
  resolveIncidents(p.id, `hb:${id}`);
  done(`/app/p/${p.id}/workflows`, { ok: "Heartbeat deleted." });
}

// ---------- CRM monitoring ----------
const crmPath = (id: number) => `/app/p/${id}/crm`;

export async function addCrmAction(form: FormData) {
  const p = await project(form);
  const provider = providerById(str(form, "provider"));
  if (!provider?.fetch) done(crmPath(p.id), { error: "Pick a CRM." });
  const over = limitError(p.user_id, "monitors");
  if (over) done(crmPath(p.id), { error: over });
  const creds: Record<string, string> = {};
  for (const f of provider!.fields) {
    const v = str(form, f.key, 4000);
    if (!v && !f.optional) done(crmPath(p.id), { error: `${provider!.label}: ${f.label} is required.` });
    if (v) creds[f.key] = v;
  }
  try {
    for (const k of ["instance_url", "org_url", "api_url"]) if (creds[k]) await assertPublicUrl(creds[k]);
  } catch (err) {
    done(crmPath(p.id), { error: err instanceof Error ? err.message : "Invalid URL." });
  }
  const id = run(
    "INSERT INTO crm_sources (project_id, provider, name, creds_enc, created_at) VALUES (?, ?, ?, ?, ?)",
    p.id, provider!.id, str(form, "name", 120) || provider!.label, encrypt(JSON.stringify(creds)), new Date().toISOString(),
  ).lastInsertRowid;
  const r = await pollCrm(get<CrmSource>("SELECT * FROM crm_sources WHERE id = ?", id)!);
  done(crmPath(p.id), r.error
    ? { error: `Saved, but the first check failed: ${r.error} Fix the details, then click "Check now".` }
    : { ok: `Connected to ${provider!.label}! Read ${r.summary?.fetched ?? 0} recently changed records. ProofMyAI checks again every 15 minutes.` });
}

export async function updateCrmAction(form: FormData) {
  const p = await project(form);
  const required = form.getAll("required").map(String).filter((v) => REQUIRED_OPTIONS.some(([k]) => k === v));
  const follow = Number(str(form, "followup_hours"));
  run("UPDATE crm_sources SET required_fields = ?, followup_hours = ? WHERE id = ? AND project_id = ?",
    required.join(","), (FOLLOWUP_OPTIONS as readonly number[]).includes(follow) ? follow : 0, Number(form.get("crmId")), p.id);
  done(crmPath(p.id), { ok: "Checks saved." });
}

export async function checkCrmNowAction(form: FormData) {
  const p = await project(form);
  const src = get<CrmSource>("SELECT * FROM crm_sources WHERE id = ? AND project_id = ?", Number(form.get("crmId")), p.id);
  if (!src) done(crmPath(p.id), { error: "CRM not found." });
  const r = await pollCrm(src!);
  done(crmPath(p.id), r.error ? { error: r.error } : { ok: `Checked ${src!.name}: ${r.summary?.fetched ?? 0} changed records, ${r.summary?.created ?? 0} new.` });
}

export async function deleteCrmAction(form: FormData) {
  const p = await project(form);
  const id = Number(form.get("crmId"));
  run("DELETE FROM crm_sources WHERE id = ? AND project_id = ?", id, p.id);
  for (const k of ["conn", "dupes", "bulk", "fields", "followup", "stale"]) resolveIncidents(p.id, `crm:${id}:${k}`);
  done(crmPath(p.id), { ok: "CRM disconnected and its data deleted." });
}
