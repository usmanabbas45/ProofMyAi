/**
 * Free n8n Workflow Risk Scanner. Reads a pasted n8n workflow (JSON from Download or from copying nodes on the
 * canvas) and reports design risks: secrets pasted into nodes, open webhooks, errors that pass as success,
 * no retries on AI and API calls, no error workflow and more. Pure rules with no imports, so it runs entirely in
 * the visitor's browser: the workflow is never uploaded.
 */

export type Severity = "high" | "medium" | "low";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  why: string;
  fix: string;
  nodes: string[];
}

export interface ScanResult {
  name: string;
  score: number;
  grade: "Good" | "Needs work" | "At risk";
  nodeCount: number;
  findings: Finding[];
  passed: string[];
  /** Checks that need the workflow's settings, which aren't included when nodes are copied from the canvas. */
  settingsMissing: boolean;
}

interface N8nNode {
  id?: string;
  name?: string;
  type?: string;
  disabled?: boolean;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  retryOnFail?: boolean;
  onError?: string;
  continueOnFail?: boolean;
}

interface N8nWorkflow {
  name?: string;
  nodes?: N8nNode[];
  connections?: Record<string, { main?: ({ node?: string }[] | null)[]; ai_outputParser?: ({ node?: string }[] | null)[] }>;
  settings?: Record<string, unknown>;
  pinData?: Record<string, unknown>;
}

export const MAX_INPUT = 3_000_000;

const PENALTY: Record<Severity, number> = { high: 20, medium: 10, low: 3 };

const T = (t: string | undefined) => (t ?? "").toLowerCase();
const short = (t: string | undefined) => (t ?? "").split(".").pop() ?? "";

const TRIGGER = /trigger$|\.webhook$|\.cron$|\.start$|\.interval$|formtrigger|chattrigger/i;
const AI_ROOT = /langchain\.(agent|chainllm|chainsummarization|chainretrievalqa|openai|informationextractor|textclassifier|sentimentanalysis)$|n8n-nodes-base\.openai$|langchain\.(anthropic|googlegemini|mistralai)$/i;
const CHECK_NODE = /\.(if|filter|switch|stopanderror|code|function|functionitem)$/i;
const FETCH_NODE = /\.(httprequest|googlesheets|airtable|notion|hubspot|salesforce|pipedrive|postgres|mysql|supabase|mongodb|graphql|rssfeedread|gmail|microsoftexcel|baserow|nocodb)$/i;
// App nodes that call an outside service and benefit from "Retry on fail".
const EXTERNAL = /\.(httprequest|slack|gmail|googlesheets|airtable|notion|hubspot|salesforce|pipedrive|telegram|discord|twilio|sendgrid|mailchimp|stripe|shopify|woocommerce|graphql|microsoftteams|microsoftoutlook|whatsapp|emailsend)$/i;

/** Known secret formats, plus "secret-looking" values in auth-like fields. */
const SECRET_PATTERNS: [string, RegExp][] = [
  ["OpenAI key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Stripe secret key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/],
  ["Telegram bot token", /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/],
  ["Bearer token", /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/],
];
const AUTH_FIELD = /^(authorization|x-api-key|api[-_]?key|apikey|token|access[-_]?token|secret|client[-_]?secret|password|x-auth-token)$/i;

const isExpression = (v: string) => v.startsWith("=") || /\{\{.*\}\}/.test(v);
/** Template placeholders such as YOUR_API_KEY, {your_token}, <token>, xxxx or SUPABASE_KEY are not real secrets. */
const isPlaceholder = (v: string) =>
  /your|example|placeholder|replace|change[-_ ]?me|insert|enter[-_ ]?|_here|xxxx|\*\*\*\*|<[^>]+>|\{[^}]*\}|\[[^\]]*\]|^(test|demo|dummy|sample)/i.test(v) || /^[A-Z0-9_]+$/.test(v);

/** Shows only enough of a secret to recognise it. */
export const maskSecret = (s: string) => (s.length <= 8 ? "••••" : `${s.slice(0, 6)}••••${s.slice(-2)}`);

function walk(value: unknown, path: string[], visit: (key: string, v: string, path: string[]) => void, depth = 0): void {
  if (depth > 12 || value == null) return;
  if (typeof value === "string") return visit(path[path.length - 1] ?? "", value, path);
  if (Array.isArray(value)) return value.forEach((v, i) => walk(v, [...path, String(i)], visit, depth + 1));
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    // n8n stores headers and query parameters as {name, value} pairs.
    if (typeof o.name === "string" && typeof o.value === "string") visit(o.name, o.value, [...path, o.name]);
    for (const [k, v] of Object.entries(o)) if (!(k === "value" && typeof o.name === "string")) walk(v, [...path, k], visit, depth + 1);
  }
}

function findSecrets(node: N8nNode): string[] {
  const found: string[] = [];
  walk(node.parameters, [], (key, v) => {
    if (!v || v.length > 20000) return;
    for (const [label, re] of SECRET_PATTERNS) {
      const m = v.match(re);
      if (m && !isPlaceholder(m[0].replace(/^Bearer\s+/i, ""))) { found.push(`${label} (${maskSecret(m[0])})`); return; }
    }
    const val = v.replace(/^Bearer\s+/i, "").trim();
    if (AUTH_FIELD.test(key) && !isExpression(v) && !isPlaceholder(val) && val.length >= 16 && !/\s/.test(val)) found.push(`value of "${key}" (${maskSecret(val)})`);
  });
  return [...new Set(found)];
}

/** Accepts a single workflow, copied nodes ({nodes, connections}), or an array of workflows. */
export function parseWorkflows(text: string): { ok: true; workflows: N8nWorkflow[] } | { ok: false; error: string } {
  if (!text.trim()) return { ok: false, error: "Paste a workflow first." };
  if (text.length > MAX_INPUT) return { ok: false, error: "That's too large. Paste one workflow at a time." };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That isn't valid n8n workflow JSON. In n8n, open the workflow, press Ctrl+A then Ctrl+C on the canvas, and paste here. Or use ⋯ → Download and paste the file's contents." };
  }
  const list = (Array.isArray(data) ? data : [data]).filter((w): w is N8nWorkflow => Boolean(w) && typeof w === "object" && Array.isArray((w as N8nWorkflow).nodes));
  if (!list.length) return { ok: false, error: "No n8n nodes found. Make sure you copied the workflow itself (it starts with {\"nodes\": …})." };
  return { ok: true, workflows: list.slice(0, 25) };
}

export function scanWorkflow(wf: N8nWorkflow): ScanResult {
  const nodes = (wf.nodes ?? []).filter((n) => n && typeof n === "object");
  const active = nodes.filter((n) => !n.disabled);
  const findings: Finding[] = [];
  const passed: string[] = [];
  const add = (f: Finding) => { if (f.nodes.length || f.id.startsWith("wf-")) findings.push(f); };
  const names = (list: N8nNode[]) => list.map((n) => n.name ?? short(n.type));
  const settings = wf.settings;
  const settingsMissing = !settings || typeof settings !== "object";

  // ---- High: secrets, open webhooks, swallowed errors ----
  const secretNodes = nodes.map((n) => ({ n, s: findSecrets(n) })).filter((x) => x.s.length);
  if (secretNodes.length) {
    add({
      id: "secrets", severity: "high", title: "API keys or tokens are pasted inside nodes",
      why: `Anyone you share or export this workflow with can read them, and they end up in backups and Git. Found: ${secretNodes.flatMap((x) => x.s).slice(0, 6).join(", ")}.`,
      fix: "Move each key into an n8n Credential (Credentials → Add credential, e.g. Header Auth) and select it in the node. Then rotate the exposed key with the provider, because it has already been shared.",
      nodes: secretNodes.map((x) => x.n.name ?? short(x.n.type)),
    });
  } else passed.push("No API keys or tokens pasted inside nodes");

  const webhooks = active.filter((n) => /\.webhook$/i.test(n.type ?? ""));
  const openHooks = webhooks.filter((n) => !n.parameters?.authentication || n.parameters.authentication === "none");
  if (openHooks.length) {
    add({
      id: "open-webhook", severity: "high", title: "Webhook with no authentication",
      why: "Anyone who finds or guesses the URL can trigger this workflow: send fake orders or leads, run up your AI bill, or flood your CRM.",
      fix: "In the Webhook node, set Authentication to Header Auth (or Basic Auth) and send that header from the app that calls it.",
      nodes: names(openHooks),
    });
  } else if (webhooks.length) passed.push("Webhooks require authentication");

  const swallowed = active.filter((n) => n.onError === "continueRegularOutput" || n.continueOnFail === true);
  if (swallowed.length) {
    add({
      id: "swallowed-errors", severity: "high", title: "Errors are passed on as if the step worked",
      why: "These nodes are set to \"On Error: Continue\", so when they fail the run still ends as success. This is the most common cause of silent failures.",
      fix: "Set On Error to \"Continue (using error output)\" and connect the error output to an alert, or to \"Stop Workflow\" so your error workflow fires.",
      nodes: names(swallowed),
    });
  }

  // ---- Medium ----
  const aiNoRetry = active.filter((n) => AI_ROOT.test(n.type ?? "") && !n.retryOnFail);
  if (aiNoRetry.length) {
    add({
      id: "ai-retry", severity: "medium", title: "AI steps have no retry",
      why: "AI providers often answer 429 (rate limit) or 5xx for a few seconds. Without a retry, one busy moment fails the whole run.",
      fix: "Open the node → Settings → turn on Retry On Fail (3 tries, 5000 ms wait).",
      nodes: names(aiNoRetry),
    });
  } else if (active.some((n) => AI_ROOT.test(n.type ?? ""))) passed.push("AI steps retry on failure");

  // A model can answer "200 OK" with broken or half-empty output: nothing fails, so no retry or error workflow fires.
  // Extractors and classifiers already return a fixed structure, so only free-text AI steps are checked.
  const freeText = active.filter((n) => AI_ROOT.test(n.type ?? "") && !/(informationextractor|textclassifier|sentimentanalysis)$/i.test(n.type ?? ""));
  const byName = new Map(nodes.flatMap((n) => [[n.name ?? "", n], [n.id ?? "", n]] as [string, N8nNode][]));
  const parsed = new Set(Object.values(wf.connections ?? {}).flatMap((o) => (o?.ai_outputParser ?? []).flat().map((c) => c?.node)));
  const checked = (n: N8nNode) =>
    parsed.has(n.name) || (n.id ? parsed.has(n.id) : false) || n.parameters?.hasOutputParser === true ||
    (wf.connections?.[n.name ?? ""]?.main ?? wf.connections?.[n.id ?? ""]?.main ?? []).flat().some((c) => CHECK_NODE.test(byName.get(c?.node ?? "")?.type ?? ""));
  const unchecked = freeText.filter((n) => !checked(n));
  if (unchecked.length) {
    add({
      id: "ai-output-unchecked", severity: "medium", title: "AI output is used without checking its structure",
      why: "A model can reply \"200 OK\" with broken JSON, a missing field or an empty answer. Nothing fails, so no retry or error workflow catches it, and the bad output flows straight into your CRM, email or reply.",
      fix: "Attach a Structured Output Parser to the AI node (Require Specific Output Format → on), or add an IF or Code node right after it that checks the fields you need and stops with Stop and Error when they're missing.",
      nodes: names(unchecked),
    });
  } else if (freeText.length) passed.push("AI output is checked before it's used");

  const extNoRetry = active.filter((n) => EXTERNAL.test(n.type ?? "") && !n.retryOnFail);
  if (extNoRetry.length) {
    add({
      id: "api-retry", severity: "medium", title: "API calls have no retry",
      why: "A short timeout or 502 from an outside service stops the run, even though trying again a few seconds later would have worked.",
      fix: "Open each node → Settings → turn on Retry On Fail. For calls that create things (orders, payments, emails), only retry if the service ignores duplicates.",
      nodes: names(extNoRetry),
    });
  }

  const neverError = active.filter((n) => {
    const o = n.parameters?.options as Record<string, unknown> | undefined;
    const r = (o?.response as Record<string, unknown> | undefined)?.response as Record<string, unknown> | undefined;
    return /\.httprequest$/i.test(n.type ?? "") && (r?.neverError === true || o?.neverError === true);
  });
  if (neverError.length) {
    add({
      id: "never-error", severity: "medium", title: "HTTP errors are treated as success",
      why: "\"Never Error\" is on, so a 401, 404 or 500 response flows on as normal data and the run ends green.",
      fix: "Turn off Never Error, or add an IF node right after that checks the status code and stops on anything that isn't 2xx.",
      nodes: names(neverError),
    });
  }

  const fetchers = active.filter((n) => FETCH_NODE.test(n.type ?? ""));
  const hasCheck = active.some((n) => CHECK_NODE.test(n.type ?? ""));
  if (fetchers.length && !hasCheck) {
    add({
      id: "empty-results", severity: "medium", title: "Nothing checks for empty results",
      why: "If a step returns 0 items (an expired token, a changed sheet, an empty API reply), n8n simply stops and marks the run as success. Nobody is told.",
      fix: "Add an IF node after the data step (e.g. {{ $items().length }} is 0) that goes to Stop and Error or an alert.",
      nodes: names(fetchers),
    });
  } else if (fetchers.length) passed.push("The workflow checks data before using it");

  if (settingsMissing) {
    // Copied from the canvas: the error workflow and timezone can't be checked.
  } else if (!settings.errorWorkflow && !nodes.some((n) => /errortrigger$/i.test(n.type ?? ""))) {
    add({
      id: "wf-error-workflow", severity: "medium", title: "No error workflow is set",
      why: "When this workflow fails, n8n only writes it in the execution log. No message, no email: you find out when a customer complains.",
      fix: "Create a workflow that starts with an Error Trigger and sends you a Slack, email or WhatsApp message. Then in this workflow: ⋯ → Settings → Error Workflow → choose it.",
      nodes: [],
    });
  } else passed.push("An error workflow is set");

  const pinned = Object.keys(wf.pinData ?? {});
  if (pinned.length) {
    add({
      id: "pinned-data", severity: "medium", title: "Pinned test data is saved in the workflow",
      why: "Pinned data travels with every export and share. It often contains real customer names, emails or orders.",
      fix: "Unpin the data on these nodes (pin icon in the node output) before sharing or exporting the workflow.",
      nodes: pinned,
    });
  }

  // ---- Low ----
  const schedules = active.filter((n) => /scheduletrigger$|\.cron$|\.interval$/i.test(n.type ?? ""));
  if (schedules.length && !settingsMissing && !settings.timezone) {
    add({
      id: "timezone", severity: "low", title: "Schedule uses the server's timezone",
      why: "With no timezone set, schedules run on the server's clock (often UTC), so a \"9am\" job may run at the wrong hour for you.",
      fix: "⋯ → Settings → Timezone → choose yours.",
      nodes: names(schedules),
    });
  }
  if (schedules.length) {
    add({
      id: "no-heartbeat", severity: "low", title: "Nobody notices if this stops running",
      why: "If n8n itself goes down, is paused, or the workflow is switched off, no error happens, so no error workflow fires.",
      fix: "Use an outside \"hasn't run\" check: an alert when the expected run doesn't arrive on time.",
      nodes: names(schedules),
    });
  }

  const disabled = nodes.filter((n) => n.disabled);
  if (disabled.length) {
    add({
      id: "disabled", severity: "low", title: "Switched-off nodes",
      why: "Disabled nodes are skipped. Sometimes that's a forgotten test change that quietly removes a step.",
      fix: "Delete them if they're not needed, or switch them back on.",
      nodes: names(disabled),
    });
  }

  const targets = new Set<string>();
  for (const out of Object.values(wf.connections ?? {})) for (const branch of out?.main ?? []) for (const c of branch ?? []) if (c?.node) targets.add(c.node);
  // Langchain sub-nodes (models, memory, tools) connect through ai_* ports, not main.
  const subNodeTargets = new Set(Object.values(wf.connections ?? {}).flatMap((o) => Object.entries(o ?? {}).filter(([k]) => k !== "main").flatMap(([, b]) => (b as ({ node?: string }[] | null)[]).flat().map((c) => c?.node))));
  const sources = new Set(Object.keys(wf.connections ?? {}));
  // n8n links nodes by name (some tools rewrite this to ids); only judge when the links match the nodes.
  const ids = new Set(nodes.flatMap((n) => [n.name, n.id].filter(Boolean) as string[]));
  const linked = (n: N8nNode) => [n.name, n.id].some((k) => k && (targets.has(k) || subNodeTargets.has(k) || sources.has(k)));
  const share = (set: Set<string>) => (set.size ? [...set].filter((k) => ids.has(k)).length / set.size : 0);
  const linksMatch = share(sources) >= 0.8 && share(targets) >= 0.8;
  const orphans = active.filter((n) => !TRIGGER.test(n.type ?? "") && !linked(n) && !/stickynote$/i.test(n.type ?? ""));
  if (orphans.length && linksMatch) {
    add({
      id: "orphans", severity: "low", title: "Nodes that are never reached",
      why: "These nodes aren't connected to anything, so they never run.",
      fix: "Connect them where they belong, or delete them.",
      nodes: names(orphans),
    });
  }

  const realNodes = nodes.filter((n) => !/stickynote$/i.test(n.type ?? ""));
  const penalty = findings.reduce((s, f) => s + PENALTY[f.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    name: wf.name?.trim() || "Pasted workflow",
    score,
    grade: score >= 80 ? "Good" : score >= 50 ? "Needs work" : "At risk",
    nodeCount: realNodes.length,
    findings,
    passed,
    settingsMissing,
  };
}

/** A realistic risky workflow for the "Try an example" button. The key is fake. */
export const EXAMPLE_WORKFLOW = JSON.stringify({
  name: "New lead → AI reply → CRM",
  nodes: [
    { name: "Lead webhook", type: "n8n-nodes-base.webhook", parameters: { httpMethod: "POST", path: "new-lead" } },
    { name: "Enrich lead", type: "n8n-nodes-base.httpRequest", parameters: { url: "https://api.example-enrich.com/v1/person", sendHeaders: true, headerParameters: { parameters: [{ name: "Authorization", value: "Bearer 9f3kQ7xLm2Vb8nR4tY6wZ1pS5dH0jC3e" }] } }, onError: "continueRegularOutput" },
    { name: "Write reply", type: "@n8n/n8n-nodes-langchain.agent", parameters: { text: "={{ $json.message }}" } },
    { name: "Add to HubSpot", type: "n8n-nodes-base.hubspot", parameters: { resource: "contact" } },
    { name: "Daily summary", type: "n8n-nodes-base.scheduleTrigger", parameters: {} },
  ],
  connections: {
    "Lead webhook": { main: [[{ node: "Enrich lead", type: "main", index: 0 }]] },
    "Enrich lead": { main: [[{ node: "Write reply", type: "main", index: 0 }]] },
    "Write reply": { main: [[{ node: "Add to HubSpot", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
}, null, 2);
