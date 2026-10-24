import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  alert_webhook TEXT,
  alert_email TEXT,
  agent_cost_budget_usd REAL NOT NULL DEFAULT 1.0,
  agent_max_steps INTEGER NOT NULL DEFAULT 25,
  agent_max_ms INTEGER NOT NULL DEFAULT 120000,
  agent_ai_review INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kb_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  score REAL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  verdict TEXT NOT NULL,
  severity TEXT NOT NULL,
  reason TEXT NOT NULL,
  source_doc TEXT,
  confidence REAL NOT NULL,
  features_json TEXT NOT NULL,
  risk REAL,
  feedback TEXT,
  corrected_verdict TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_items_audit ON audit_items(audit_id);
CREATE TABLE IF NOT EXISTS bot_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  headers_enc TEXT,
  body_template TEXT NOT NULL,
  response_path TEXT NOT NULL,
  last_run_at TEXT
);
CREATE TABLE IF NOT EXISTS test_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  expected TEXT NOT NULL,
  must_not TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES bot_targets(id) ON DELETE CASCADE,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  case_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  pass INTEGER NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  final_output TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  total_cost_usd REAL NOT NULL,
  total_ms INTEGER NOT NULL,
  issues_json TEXT NOT NULL,
  score REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, external_id)
);
CREATE TABLE IF NOT EXISTS workflow_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  scenario_ids TEXT NOT NULL DEFAULT '',
  expected_interval_min INTEGER,
  last_polled_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  duration_ms INTEGER,
  output_items INTEGER,
  error_message TEXT,
  UNIQUE(project_id, platform, execution_id)
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_runs(project_id, workflow_id, started_at);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  dedupe_key TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_incidents_project ON incidents(project_id, created_at);
CREATE TABLE IF NOT EXISTS risk_models (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  weights_json TEXT NOT NULL,
  n_samples INTEGER NOT NULL,
  val_accuracy REAL NOT NULL,
  trained_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** Additive migrations for databases created by older versions. */
function addColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrate(db: DatabaseSync): void {
  addColumn(db, "audits", "judge", "TEXT");
  addColumn(db, "audits", "share_token", "TEXT");
  addColumn(db, "audit_items", "created_at", "TEXT");
  addColumn(db, "audit_items", "frustrated", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "audit_items", "rule_hit", "TEXT");
  addColumn(db, "projects", "redact_pii", "INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "projects", "report_brand", "TEXT");
  addColumn(db, "projects", "weekly_digest", "INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "projects", "last_digest_at", "TEXT");
  addColumn(db, "users", "plan", "TEXT NOT NULL DEFAULT 'free'");
  addColumn(db, "users", "plan_status", "TEXT");
  addColumn(db, "users", "paddle_customer_id", "TEXT");
  addColumn(db, "users", "paddle_subscription_id", "TEXT");
  addColumn(db, "users", "plan_renews_at", "TEXT");
  addColumn(db, "users", "plan_cancel_at", "TEXT");
  addColumn(db, "users", "trial_ends_at", "TEXT");
  addColumn(db, "users", "plan_updated_at", "TEXT");
  addColumn(db, "projects", "mask_terms", "TEXT");
  addColumn(db, "projects", "retention_days", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "projects", "store_text", "INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "projects", "use_ai", "INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "projects", "reply_timeout_sec", "INTEGER NOT NULL DEFAULT 120");
  addColumn(db, "audit_items", "conv_flags", "TEXT");
  addColumn(db, "audit_items", "latency_ms", "INTEGER");
  addColumn(db, "audit_items", "cost_usd", "REAL");
  addColumn(db, "audit_items", "bot_error", "TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS pending_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    question TEXT NOT NULL,
    received_at TEXT NOT NULL,
    error TEXT,
    alerted INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, conversation_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    page TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    reply TEXT,
    replied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,
    company TEXT,
    website TEXT,
    quote TEXT NOT NULL,
    result TEXT,
    rating INTEGER NOT NULL DEFAULT 5,
    consent INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'in_app',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT
  )`);
  // AI usage per call: token counts and dollar cost only, never any customer text. No foreign keys, so
  // the cost history survives when a project or account is deleted.
  db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    user_id INTEGER,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS ai_usage_created ON ai_usage (created_at)");
  // Graded results for exact repeat conversations (same project, help docs, judge and text), keyed by a
  // hash so no customer text is stored here. Saves paying the AI judge twice for the same answer.
  db.exec(`CREATE TABLE IF NOT EXISTS judge_cache (
    key TEXT PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS judge_cache_created ON judge_cache (created_at)");
  // One row per user per day they used the app: powers retention cohorts.
  db.exec(`CREATE TABLE IF NOT EXISTS user_activity (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  )`);
  // Daily business snapshot (MRR history), written by the cron and the analytics page.
  db.exec(`CREATE TABLE IF NOT EXISTS metrics_daily (
    day TEXT PRIMARY KEY,
    users INTEGER NOT NULL,
    paying INTEGER NOT NULL,
    trialing INTEGER NOT NULL,
    mrr REAL NOT NULL,
    ai_cost REAL NOT NULL DEFAULT 0
  )`);
  // Uptime monitors: a URL checked every few minutes, with its latest state.
  db.exec(`CREATE TABLE IF NOT EXISTS uptime_monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    keyword TEXT,
    interval_min INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending',
    fails INTEGER NOT NULL DEFAULT 0,
    last_checked_at TEXT,
    last_ms INTEGER,
    last_code INTEGER,
    last_error TEXT,
    down_since TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS uptime_checks (
    monitor_id INTEGER NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    ok INTEGER NOT NULL,
    ms INTEGER,
    code INTEGER
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_uptime_checks ON uptime_checks (monitor_id, at)");
  // Google Sheets watches: a link-shared sheet read as CSV every 15 minutes (see lib/sheets.ts).
  db.exec(`CREATE TABLE IF NOT EXISTS sheet_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    csv_url TEXT NOT NULL,
    stale_hours INTEGER NOT NULL DEFAULT 24,
    required_col TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    fails INTEGER NOT NULL DEFAULT 0,
    last_checked_at TEXT,
    last_changed_at TEXT,
    last_hash TEXT,
    row_count INTEGER,
    error_cells INTEGER NOT NULL DEFAULT 0,
    blank_required INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sheet_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watch_id INTEGER NOT NULL REFERENCES sheet_watches(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    level TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_sheet_events ON sheet_events (project_id, at)");
  // Live tracking events from scheduled checks (CRM, heartbeats, approvals, result checks).
  db.exec(`CREATE TABLE IF NOT EXISTS live_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    at TEXT NOT NULL,
    level TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_live_events ON live_events (project_id, at)");
  // CRM monitoring (read-only): connections, minimal record facts (hashes and filled/empty flags) and per-check counts.
  db.exec(`CREATE TABLE IF NOT EXISTS crm_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    creds_enc TEXT,
    required_fields TEXT NOT NULL DEFAULT 'email_or_phone',
    followup_hours INTEGER NOT NULL DEFAULT 0,
    fails INTEGER NOT NULL DEFAULT 0,
    last_polled_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS crm_records (
    source_id INTEGER NOT NULL REFERENCES crm_sources(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    email_hash TEXT,
    phone_hash TEXT,
    has_email INTEGER NOT NULL,
    has_phone INTEGER NOT NULL,
    has_name INTEGER NOT NULL,
    has_owner INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_activity_at TEXT,
    activity_known INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    PRIMARY KEY (source_id, external_id)
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_crm_records_created ON crm_records (source_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_crm_records_email ON crm_records (source_id, email_hash)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_crm_records_phone ON crm_records (source_id, phone_hash)");
  db.exec(`CREATE TABLE IF NOT EXISTS crm_polls (
    source_id INTEGER NOT NULL REFERENCES crm_sources(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    updated INTEGER NOT NULL,
    created INTEGER NOT NULL,
    capped INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_crm_polls ON crm_polls (source_id, at)");
  // Heartbeats (dead man's switch) for scheduled jobs.
  db.exec(`CREATE TABLE IF NOT EXISTS job_heartbeats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    every_min INTEGER NOT NULL,
    grace_min INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    last_ping_at TEXT,
    last_message TEXT,
    created_at TEXT NOT NULL
  )`);
  // Outcome checks: whether the result an agent reported was found in the real system.
  addColumn(db, "agent_runs", "verified", "INTEGER");
  addColumn(db, "agent_runs", "verify_detail", "TEXT");
  // Human-in-the-loop approvals for agent actions, the rules people create from them, and a per-project amount limit.
  db.exec(`CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    external_id TEXT,
    fingerprint TEXT NOT NULL,
    agent_name TEXT,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT,
    category TEXT,
    amount REAL,
    currency TEXT,
    reversible INTEGER,
    status TEXT NOT NULL,
    auto INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    commitments TEXT,
    decided_by TEXT,
    decided_at TEXT,
    note TEXT,
    callback_url TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_approvals_project ON approvals (project_id, status, id)");
  // Belt and braces: never two pending requests for the same action, even if several app instances race.
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_one_pending ON approvals (project_id, fingerprint) WHERE status = 'pending'");
  } catch (err) {
    console.error("[db] could not add the one-pending-approval index (existing duplicates?):", err instanceof Error ? err.message : err);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS approval_rules (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, category, action)
  )`);
  addColumn(db, "projects", "approve_over", "REAL");
  // Catch-every-failure: source connection failures, n8n/Make workflow on/off state and Make's incomplete executions.
  addColumn(db, "workflow_sources", "fails", "INTEGER NOT NULL DEFAULT 0");
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_state (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    active INTEGER,
    incomplete INTEGER,
    PRIMARY KEY (project_id, platform, workflow_id)
  )`);
  addColumn(db, "sheet_watches", "columns", "TEXT");
  addColumn(db, "sheet_watches", "dup_rows", "INTEGER");
  // Zero-output context: items the run received, and whether an empty run was judged a normal quiet run.
  addColumn(db, "workflow_runs", "input_items", "INTEGER");
  addColumn(db, "workflow_runs", "quiet", "INTEGER NOT NULL DEFAULT 0");
  // Freshness ("watermark") check: the newest date in a chosen column must be recent.
  addColumn(db, "sheet_watches", "fresh_col", "TEXT");
  addColumn(db, "sheet_watches", "fresh_hours", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "sheet_watches", "fresh_tz", "TEXT");
  addColumn(db, "sheet_watches", "newest_at", "TEXT");
  // Team members: other users with access to a project, and pending email invites.
  db.exec(`CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, user_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS project_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    token_hash TEXT NOT NULL UNIQUE,
    invited_by INTEGER,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // "Fix with AI": generated help-article fixes and safe system prompts.
  db.exec(`CREATE TABLE IF NOT EXISTS ai_fixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    audit_id INTEGER,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    title TEXT,
    output TEXT NOT NULL,
    notes TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Emails ("name@x.com") or whole domains ("@x.com") that may not sign up.
  db.exec(`CREATE TABLE IF NOT EXISTS blocklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    reason TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // WhatsApp live monitoring: the last customer message per chat, to pair with the bot's reply.
  db.exec(`CREATE TABLE IF NOT EXISTS wa_last_question (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chat TEXT NOT NULL,
    question TEXT NOT NULL,
    at_ms INTEGER NOT NULL,
    PRIMARY KEY (project_id, chat)
  )`);
  // Solved CAPTCHA challenges (each can be used once), kept until they expire.
  db.exec("CREATE TABLE IF NOT EXISTS captcha_used (id TEXT PRIMARY KEY, exp INTEGER NOT NULL)");
  db.exec(`CREATE TABLE IF NOT EXISTS recovery_codes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at TEXT,
    PRIMARY KEY (user_id, code_hash)
  )`);
  // Devices a user has logged in from, to email them about sign-ins from new ones.
  db.exec(`CREATE TABLE IF NOT EXISTS login_devices (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_hash TEXT NOT NULL,
    label TEXT NOT NULL,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, device_hash)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS heartbeats (
    name TEXT PRIMARY KEY,
    last_run_at TEXT NOT NULL,
    ok INTEGER NOT NULL,
    detail TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS uptime_days (
    day TEXT PRIMARY KEY,
    cron_runs INTEGER NOT NULL DEFAULT 0,
    cron_failures INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS alert_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    target TEXT NOT NULL,
    secret_enc TEXT,
    min_severity TEXT NOT NULL DEFAULT 'medium',
    modules TEXT NOT NULL DEFAULT '',
    notify_resolved INTEGER NOT NULL DEFAULT 0,
    last_status TEXT,
    last_sent_at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS chat_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    bot_address TEXT NOT NULL,
    cursor TEXT,
    last_polled_at TEXT,
    last_error TEXT
  )`);
  addColumn(db, "users", "dpa_accepted_at", "TEXT");
  addColumn(db, "users", "dpa_company", "TEXT");
  addColumn(db, "users", "suspended_at", "TEXT");
  addColumn(db, "users", "ga_client_id", "TEXT");
  addColumn(db, "users", "last_seen_at", "TEXT");
  addColumn(db, "users", "admin_note", "TEXT");
  addColumn(db, "users", "founding_at", "TEXT");
  addColumn(db, "users", "comp_ends_at", "TEXT");
  addColumn(db, "users", "comp_reminded_at", "TEXT");
  // Two-factor authentication (TOTP). Secrets are stored encrypted.
  addColumn(db, "users", "totp_secret_enc", "TEXT");
  addColumn(db, "users", "totp_pending_enc", "TEXT");
  addColumn(db, "users", "totp_enabled_at", "TEXT");
  addColumn(db, "users", "totp_last_step", "INTEGER");
  // Backfill from what we already know (sign-up day and last active day); runs harmlessly on every start.
  db.exec("INSERT OR IGNORE INTO user_activity (user_id, day) SELECT id, substr(created_at, 1, 10) FROM users");
  db.exec("INSERT OR IGNORE INTO user_activity (user_id, day) SELECT id, substr(last_seen_at, 1, 10) FROM users WHERE last_seen_at IS NOT NULL");
  db.exec(`CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_email TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    pattern TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  addColumn(db, "users", "renew_reminded_for", "TEXT");
  // AI-suggested chatbot tests, waiting for the customer to add or dismiss them.
  db.exec(`CREATE TABLE IF NOT EXISTS test_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    expected TEXT NOT NULL,
    must_not TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    why TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  addColumn(db, "projects", "tests_generated_at", "TEXT");
  // Chatbot analytics: topic of each answer, and ratings from the bot's own users (thumbs up/down, stars).
  addColumn(db, "audit_items", "topic", "TEXT");
  addColumn(db, "audit_items", "evidence", "TEXT");
  addColumn(db, "audit_items", "diagnosis", "TEXT");
  addColumn(db, "audit_items", "trace_id", "TEXT");
  // End-to-end traces across chatbot, agents, workflows, approvals and outcome checks (lib/traces).
  db.exec(`CREATE TABLE IF NOT EXISTS trace_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    trace_id TEXT NOT NULL,
    source TEXT NOT NULL,
    ok INTEGER NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_trace_events ON trace_events (project_id, trace_id, at)");
  addColumn(db, "approvals", "trace_id", "TEXT");
  // Custom watches: plain-English monitoring requests turned into rules (lib/watches).
  db.exec(`CREATE TABLE IF NOT EXISTS watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    prompt TEXT NOT NULL,
    spec_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_checked_at TEXT,
    last_fired_at TEXT,
    fired_count INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_watches_project ON watches (project_id, module)");
  // Proof-of-value report: what each pre-send check decided, and when each incident was resolved.
  db.exec(`CREATE TABLE IF NOT EXISTS presend_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    decision TEXT NOT NULL,
    verdict TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_presend_project ON presend_checks (project_id, created_at)");
  addColumn(db, "incidents", "resolved_at", "TEXT");
  addColumn(db, "projects", "value_share_token", "TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_value_share ON projects(value_share_token) WHERE value_share_token IS NOT NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_items_trace ON audit_items (trace_id) WHERE trace_id IS NOT NULL");
  // Public accuracy benchmark runs (see lib/benchmark).
  db.exec(`CREATE TABLE IF NOT EXISTS benchmark_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    judge TEXT NOT NULL,
    version TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    results_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS chat_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    turn_index INTEGER,
    value REAL NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_chat_feedback ON chat_feedback(project_id, created_at)");
  // Referral program: each user's invite code, and who invited them.
  addColumn(db, "users", "ref_code", "TEXT");
  addColumn(db, "users", "referred_by", "INTEGER");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ref_code ON users(ref_code) WHERE ref_code IS NOT NULL");
  db.exec(`CREATE TABLE IF NOT EXISTS referral_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    amount_cents INTEGER,
    discount_id TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    applied_at TEXT,
    UNIQUE(friend_id, role)
  )`);
  addColumn(db, "users", "plan_interval", "TEXT NOT NULL DEFAULT 'month'");
  addColumn(db, "projects", "is_demo", "INTEGER NOT NULL DEFAULT 0");
  // Welcome emails: last one sent (0-3), 9 = finished or not wanted. Existing accounts never get them.
  const hadOnboard = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).some((c) => c.name === "onboard_step");
  addColumn(db, "users", "onboard_step", "INTEGER NOT NULL DEFAULT 0");
  if (!hadOnboard) db.exec("UPDATE users SET onboard_step = 9");
  // Email verification. Accounts created before this column existed are treated as verified.
  const hadVerified = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).some((c) => c.name === "email_verified_at");
  addColumn(db, "users", "email_verified_at", "TEXT");
  if (!hadVerified) db.exec("UPDATE users SET email_verified_at = created_at");
  db.exec(`CREATE TABLE IF NOT EXISTS email_verifications (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS server_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_server_errors_at ON server_errors(at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_items_conv ON audit_items(conversation_id, turn_index)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_audits_share ON audits(share_token) WHERE share_token IS NOT NULL");
  // Marketing attribution: where each account first came from (first visit, set by the middleware cookie).
  addColumn(db, "users", "signup_channel", "TEXT");
  addColumn(db, "users", "signup_source", "TEXT");
  addColumn(db, "users", "signup_campaign", "TEXT");
  addColumn(db, "users", "signup_landing", "TEXT");
  // Leads from the free-audit request form and the free chatbot checker.
  db.exec(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    website TEXT,
    platform TEXT,
    message TEXT,
    channel TEXT,
    source TEXT,
    campaign TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)");
  // Alert channels: pause/resume, a friendly name, and phone verification for ProofMyAI-sent WhatsApp alerts.
  addColumn(db, "alert_channels", "enabled", "INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "alert_channels", "label", "TEXT");
  addColumn(db, "alert_channels", "verify_hash", "TEXT");
  addColumn(db, "alert_channels", "verify_expires", "TEXT");
  // The old single "alert webhook" setting becomes a normal channel (same rules: medium+ problems, all modules).
  for (const p of db.prepare("SELECT id, alert_webhook FROM projects WHERE alert_webhook IS NOT NULL AND alert_webhook <> ''").all() as { id: number; alert_webhook: string }[]) {
    const type = /hooks\.slack\.com/.test(p.alert_webhook) ? "slack" : /discord(app)?\.com/.test(p.alert_webhook) ? "discord" : /office\.com|logic\.azure/.test(p.alert_webhook) ? "teams" : /chat\.googleapis/.test(p.alert_webhook) ? "google_chat" : "webhook";
    db.prepare("INSERT INTO alert_channels (project_id, type, target, min_severity) VALUES (?, ?, ?, 'medium')").run(p.id, type, p.alert_webhook);
    db.prepare("UPDATE projects SET alert_webhook = NULL WHERE id = ?").run(p.id);
  }
  // Likewise the old "alert email": it becomes an email channel once, and stays as the weekly-report address.
  addColumn(db, "projects", "legacy_email_migrated", "INTEGER NOT NULL DEFAULT 0");
  for (const p of db.prepare("SELECT id, alert_email FROM projects WHERE legacy_email_migrated = 0 AND alert_email IS NOT NULL AND alert_email <> ''").all() as { id: number; alert_email: string }[]) {
    const exists = db.prepare("SELECT 1 FROM alert_channels WHERE project_id = ? AND type = 'email' AND lower(target) = lower(?)").get(p.id, p.alert_email);
    if (!exists) db.prepare("INSERT INTO alert_channels (project_id, type, target, min_severity) VALUES (?, 'email', ?, 'medium')").run(p.id, p.alert_email);
  }
  db.exec("UPDATE projects SET legacy_email_migrated = 1 WHERE legacy_email_migrated = 0");
}

let instance: DatabaseSync | null = null;

export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!instance) instance = openDatabase(process.env.DATABASE_PATH || "./data/agentproof.db");
  return instance;
}

/** Test hook: point the app at a fresh database. */
export function setDb(db: DatabaseSync): void {
  instance = db;
}

type Row = Record<string, unknown>;
type Param = string | number | null;

export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Param[]): { lastInsertRowid: number; changes: number } {
  const r = getDb().prepare(sql).run(...params);
  return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
