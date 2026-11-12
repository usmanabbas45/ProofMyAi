import Link from "next/link";
import { PublicPage } from "@/components/site";
import { SITE_URL, VIDEOS } from "@/lib/seo";

export const metadata = {
  title: "Docs & API reference",
  description: "How to connect AI chatbots, AI agents, n8n/Make workflows, Google Sheets and CRMs to ProofMyAI: setup steps, REST API reference with examples, limits and error codes.",
  alternates: { canonical: "/docs" },
};

const API = `${SITE_URL}/api/v1`;

const TOC = [
  ["quick-start", "🚀 Quick start"],
  ["no-code", "🧩 Connect without code"],
  ["auth", "🔑 Authentication"],
  ["chat-events", "💬 POST /chat-events (live chatbot)"],
  ["check", "🛑 POST /check (stop bad answers)"],
  ["test-runs", "🧪 POST /test-runs (CI regression tests)"],
  ["approvals", "✋ POST /approvals (human approval)"],
  ["verify", "🔎 Verify results (POST /verify)"],
  ["heartbeats", "💓 Heartbeats (scheduled jobs)"],
  ["crm", "🗂️ CRM monitoring"],
  ["feedback", "👍 POST /feedback (customer ratings)"],
  ["agent-runs", "🤖 POST /agent-runs (AI agents)"],
  ["otel", "📡 OpenTelemetry traces"],
  ["calls", "📞 POST /calls (voice bots)"],
  ["followups", "🤝 Promised follow-ups"],
  ["workflow-runs", "⚙️ POST /workflow-runs (n8n, Make, Zapier)"],
  ["errors", "⚠️ Errors & limits"],
  ["privacy", "🔒 Privacy & data"],
] as const;

function Code({ children }: { children: string }) {
  return <pre style={{ overflowX: "auto" }}><code>{children}</code></pre>;
}

function Fields({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>{rows.map(([f, t, d]) => <tr key={f}><td><code>{f}</code></td><td>{t}</td><td>{d}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  return (
    <PublicPage title="Docs & API reference">
      <p>Everything you need to connect your AI chatbot (on any AI model, including Grok, ChatGPT, Claude and Gemini), AI agents, n8n/Make automations, Google Sheets and CRM to ProofMyAI. Most setups take under 10 minutes and many need no code at all. Prefer video? Watch the <a href={`https://www.youtube.com/watch?v=${VIDEOS.tutorial.id}`} target="_blank" rel="noopener">3-minute setup tutorial ↗</a> or see alerts arrive in the <a href={`https://www.youtube.com/watch?v=${VIDEOS.live.id}`} target="_blank" rel="noopener">live demo ↗</a>.</p>
      <nav className="card docs-toc" aria-label="On this page">
        <strong>📚 On this page</strong>
        <ol>{TOC.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ol>
      </nav>

      <h2 id="quick-start">🚀 Quick start</h2>
      <ol>
        <li><Link href="/signup">Create a free account</Link> (50 conversations a month free).</li>
        <li>Open your project → <strong>Settings</strong> and copy your <strong>API key</strong> (it starts with <code>ap_live_</code>). Each project has its own key.</li>
        <li>Pick what you want to monitor: upload chat transcripts, connect n8n/Make, or send events to the API below.</li>
        <li>Add a WhatsApp, Slack, Teams, email, Telegram or webhook channel under <strong>Settings → Notifications</strong> so you hear about problems.</li>
      </ol>

      <h2 id="no-code">🧩 Connect without code</h2>
      <ul>
        <li><strong>Chat transcripts:</strong> export conversations from Intercom, Tidio, Crisp, Zendesk or any bot as CSV/JSON and upload them in <em>Chatbot audits</em>. Add your help articles first so answers are checked against them.</li>
        <li><strong>Nightly bot tests:</strong> in <em>Chatbot tests</em>, paste your bot&apos;s HTTP endpoint and a list of questions with the facts a right answer must include. ProofMyAI asks your bot every night.</li>
        <li><strong>n8n:</strong> n8n → Settings → n8n API → create a key. In ProofMyAI open <em>n8n &amp; Make</em> → Connect n8n and paste your n8n URL and key. Executions are pulled every 15 minutes, and workflows that stop running or go quiet are caught too. <strong>For instant alerts</strong> (seconds, not minutes), also add an <em>Error Trigger</em> workflow in n8n that posts to <a href="#workflow-runs">POST /workflow-runs</a>.</li>
        <li><strong>Make:</strong> Make → Profile → API access → add a token with <code>scenarios:read</code>. Connect Make in ProofMyAI with your scenario IDs.</li>
        <li><strong>WhatsApp live monitoring (WAHA):</strong> add the webhook <code>{API}/whatsapp/waha</code> to your WAHA session with the event <code>message.any</code> and header <code>X-Api-Key</code> set to your project key. Customer messages and bot replies are paired and checked; phone numbers are replaced with anonymous codes.</li>
        <li><strong>Intercom (Fin):</strong> in <em>Connect → Intercom</em>, paste an Intercom access token. Every Fin or bot reply is checked automatically.</li>
        <li><strong>Google Sheets:</strong> in <em>Google Sheets</em>, paste a sheet link. Alerts when it stops updating, shows #REF! or other errors, a key column comes in empty, columns change or rows are duplicated.</li>
        <li><strong>CRM:</strong> in <em>CRM</em>, paste a read-only token for HubSpot, Salesforce, Pipedrive, Zoho CRM, GoHighLevel and others (see <a href="#crm">CRM monitoring</a>).</li>
        <li><strong>Watch for anything, in your own words:</strong> every feature page has a &quot;Watch for…&quot; box. Write what to watch and when to be told (e.g. &quot;Alert me if the Order sync workflow runs fewer than 10 times a day&quot;). ProofMyAI shows how it understood the request and how often it would have alerted in the last 7 days, then checks it on every new event and every 15 minutes.</li>
        <li><strong>Grok, ChatGPT, Claude or Gemini bots:</strong> any model works. <em>Connect → Grok (xAI) chatbot</em> has a ready-made example; the same call works for every model (see <a href="#chat-events">POST /chat-events</a>).</li>
        <li><strong>Twilio / WhatsApp:</strong> in <em>Live tracking</em>, connect Twilio with a read-only API key to check bot replies on SMS and WhatsApp.</li>
      </ul>

      <h2 id="auth">🔑 Authentication</h2>
      <p>Send your project API key with every request, in either header:</p>
      <Code>{`Authorization: Bearer ap_live_xxxxxxxxxxxxxxxx
# or
X-API-Key: ap_live_xxxxxxxxxxxxxxxx`}</Code>
      <p>Base URL: <code>{API}</code>. Bodies are JSON (<code>Content-Type: application/json</code>), up to 2 MB. Keep the key on your server; don&apos;t put it in browser code. You can regenerate it in Settings at any time.</p>

      <h2 id="chat-events">💬 POST /chat-events: live chatbot monitoring</h2>
      <p>Send each conversation as it happens, either the full message history or just the newest question and answer. Personal data is masked before anything is stored or checked. Replies are graded in the background against your help articles and rules.</p>
      <Fields rows={[
        ["conversation_id", "string, required", "Your ID for the conversation. Sending the same ID again adds only the new turns."],
        ["messages", "array", "Full history: [{ role: \"user\" | \"assistant\", content }]."],
        ["question", "string", "The customer's message. Send it alone when the customer writes, and ProofMyAI alerts you if the bot never replies."],
        ["answer", "string", "The bot's reply to question."],
        ["bot_name", "string", "Optional label when you run several bots."],
        ["latency_ms", "integer", "Optional: how long the reply took."],
        ["cost_usd", "number", "Optional: what the reply cost."],
        ["error", "string", "Optional: an error your bot hit while replying."],
        ["retrieved", "string[]", "Optional (RAG bots): the text chunks your bot retrieved for this reply. When an answer is wrong, ProofMyAI says whether it was a retrieval problem (the right fact wasn't fetched), a generation problem (it was fetched and ignored) or missing documentation. Used for the check only, never stored."],
        ["trace_id", "string", "Optional: your id for one end-to-end request (e.g. an order or ticket number). Send the same id to /check, /agent-runs, /workflow-runs, /approvals and /verify, then open Live tracking → 🔗 Traces to see every step on one timeline, with the first failing step highlighted. Kept up to 90 days (or your retention setting)."],
      ]} />
      <p>Send <code>messages</code>, or <code>question</code> + <code>answer</code>, or just <code>question</code>.</p>
      <Code>{`curl -X POST ${API}/chat-events \\
  -H "Authorization: Bearer $PROOFMYAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversation_id": "chat-8841",
    "question": "How much is shipping to Germany?",
    "answer": "Shipping to Germany is free on all orders.",
    "latency_ms": 1850
  }'`}</Code>
      <p>Response <code>202</code>: <code>{`{"accepted": 1}`}</code>. Add <code>?wait=1</code> to wait for the verdicts (slower; useful for testing):</p>
      <Code>{`{"graded": 1, "results": [{"turn_index": 0, "verdict": "hallucination", "label": "Made up",
  "severity": "high", "reason": "The shipping article says Germany costs €9.90; free shipping is not mentioned."}]}`}</Code>
      <p>Verdicts: <code>correct</code>, <code>unsupported</code> (not in your docs), <code>hallucination</code> (made up), <code>should_escalate</code>, <code>off_policy</code>, <code>unclear</code>.</p>
      <p><strong>Tip:</strong> call the API without waiting for it (fire-and-forget) so your bot never slows down. The <em>Live tracking</em> page in your dashboard has ready-made cURL, JavaScript and Python snippets that do this safely, plus no-code steps for Intercom, Zendesk, Crisp and Tidio through n8n or Make.</p>

      <h2 id="check">🛑 POST /check: stop a bad answer before it's sent</h2>
      <p>The pre-send check (guardrail). Before your chatbot sends a reply, or before an AI agent acts on its decision (a refund, a discount, a booking), send the question and the draft reply. ProofMyAI checks it against your help docs and rules and answers in a few seconds. The answer is also monitored as usual.</p>
      <Code>{`curl -X POST ${API}/check \
  -H "Authorization: Bearer ap_live_your_key" -H "Content-Type: application/json" \
  -d '{"question": "Can I return a sale item for a refund?",
       "answer": "Yes, every item gets a full refund within 30 days."}'`}</Code>
      <Code>{`{"decision": "block", "verdict": "hallucination", "label": "Made up", "severity": "high",
 "reason": "The returns article says sale items get store credit only.",
 "stated_as_fact": true,
 "source": "Returns & refunds",
 "evidence": "Sale items can be returned for store credit only, not a refund.",
 "area": "Returns & refunds", "area_autonomy": "human_review",
 "advice": "Do not send. Hand the customer to a person."}`}</Code>
      <p><code>evidence</code> is the exact sentence from your help docs behind the verdict. A quote from the AI judge is only kept if it appears in your docs word for word, so the evidence is never made up. It&apos;s also shown on every checked answer in your dashboard and in the CSV export.</p>
      <p><code>stated_as_fact</code> is <code>true</code> when a wrong answer was said with full confidence (&quot;Yes, all items…&quot;, a specific price or deadline, no hedge). Customers act on those without double-checking, so they are rated a level more serious. Such answers are marked &quot;Stated as fact&quot; in your dashboard.</p>
      <Fields rows={[
        ["allow", "decision", "Safe to send or act on."],
        ["review", "decision", "Hold it for a person to approve, or send a safe fallback such as \"Let me check that for you\". Every answer in an area your Trust report marks 🔴 returns review."],
        ["block", "decision", "Don't send it: it's made up, against your policy, or should go to a human."],
      ]} />
      <p><code>/chat-events?wait=1</code> also returns a <code>decision</code> for each reply. Each check counts as one conversation on your plan. If the check fails or times out, fall back to sending the reply as usual (or to a human for high-stakes actions).</p>

      <h2 id="test-runs">🧪 POST /test-runs: regression tests in your deploy pipeline</h2>
      <p>Changed a prompt, a model or your help docs? Run your saved <em>Chatbot tests</em> before the change goes live. ProofMyAI asks your bot every test question right now and answers with pass/fail per question. Point <code>url</code> at a preview or staging deployment to test a pull request. CI runs don&apos;t raise incidents and don&apos;t replace the nightly run.</p>
      <Fields rows={[
        ["bot", "string or number", "Name or id of the saved bot. Optional when the project has one bot."],
        ["url", "string", "Optional: test this address instead of the saved one (same body template and answer location)."],
        ["min_pass_rate", "number 0–1", "Share of questions that must pass for ok to be true. Default 1 (all)."],
      ]} />
      <Code>{`curl -X POST ${API}/test-runs \\
  -H "Authorization: Bearer $PROOFMYAI_KEY" -H "Content-Type: application/json" \\
  -d '{"url": "https://preview-42.yourbot.com/chat"}'

{"ok": false, "bot": "Support bot", "passed": 19, "failed": 1, "total": 20, "pass_rate": 0.95,
 "failures": [{"question": "Can I return a sale item?", "answer": "Yes, full refund.",
   "reason": "The answer contains a forbidden statement: \\"full refund\\"."}]}`}</Code>
      <p>GitHub Actions example: fail the build when answers get worse.</p>
      <Code>{`# .github/workflows/bot-tests.yml
name: Chatbot regression tests
on: [pull_request]
jobs:
  proofmyai:
    runs-on: ubuntu-latest
    steps:
      - name: Run ProofMyAI tests
        run: |
          RESULT=$(curl -s -X POST ${API}/test-runs \\
            -H "Authorization: Bearer \${{ secrets.PROOFMYAI_KEY }}" -H "Content-Type: application/json" \\
            -d '{"url": "\${{ vars.PREVIEW_BOT_URL }}"}')
          echo "$RESULT"
          echo "$RESULT" | jq -e '.ok == true' > /dev/null`}</Code>
      <p>Limit: 30 test runs per project per hour. Each question is graded by the AI judge when AI checking is on, otherwise by the expected facts and forbidden phrases you saved.</p>

      <h2 id="approvals">✋ POST /approvals: a person approves what matters</h2>
      <p>&quot;Automate the draft, never the send.&quot; Before your agent does something important (issues a refund, emails a customer, pays an invoice, writes to your CRM), it submits the action. Routine, reversible actions come back <code>approved</code> straight away. These wait as <code>pending</code> until someone clicks Approve or Reject on the <em>Approvals</em> page (you get an alert):</p>
      <ul>
        <li>anything marked <code>&quot;reversible&quot;: false</code>;</li>
        <li>the <b>first</b> action of a new <code>category</code> (for example a new supplier). Click &quot;Approve &amp; always allow&quot; and it becomes a rule;</li>
        <li>an <code>amount</code> at or over your limit;</li>
        <li>text that promises a refund, discount, deadline or compensation.</li>
      </ul>
      <Code>{`curl -X POST ${API}/approvals \
  -H "Authorization: Bearer ap_live_your_key" -H "Content-Type: application/json" \
  -d '{"action": "refund", "summary": "Refund order #4471 for Sara K.", "amount": 89, "currency": "GBP",
       "category": "refunds", "reversible": false, "agent_name": "Support agent", "action_id": "refund-4471",
       "details": "Hi Sara, I have refunded £89 to your card. It will arrive within 5 days.",
       "callback_url": "https://your-n8n.example.com/webhook/approval"}'`}</Code>
      <Code>{`{"id": 812, "action_id": "refund-4471", "status": "pending", "needs_human": true,
 "reason": "This can't be undone, so a person approves it first.", "commitments": ["a refund", "a deadline"],
 "poll_url": "${API}/approvals/812"}`}</Code>
      <p>Then wait for the decision: ProofMyAI POSTs <code>{`{"id", "action_id", "status", "decided_by", "note"}`}</code> to your <code>callback_url</code>, or poll <code>GET /approvals/812</code>. Only act when <code>status</code> is <code>approved</code>. Requests expire after 24 hours (<code>expires_in_hours</code>). If the agent submits an action again after a person rejected it, it stays <code>rejected</code> and you get an alert. Every decision is logged with who decided, when and their note. In n8n: HTTP Request node → Wait node (resume on webhook) → IF <code>status = approved</code>.</p>

      <p><strong>Safety guarantees</strong> (each one is covered by an automated test that runs before every release):</p>
      <ul>
        <li>The same action sent several times at once, or again while it waits, is <b>one</b> request, never a duplicate refund or payment.</li>
        <li>A rejected action stays rejected on every retry (matched by <code>action_id</code> or identical content), raises one &quot;rejected action retried&quot; alert, and can&apos;t be flipped to approved.</li>
        <li>Two people deciding at the same moment: only the first decision counts.</li>
        <li>Expired requests can never be approved later; resubmitting asks a person again.</li>
        <li>If your <code>callback_url</code> is down, the decision is still recorded and your agent can poll <code>poll_url</code> for it.</li>
        <li>Every decision records who decided, when and why.</li>
      </ul>

      <h2 id="verify">🔎 Verify results: don&apos;t take the agent&apos;s word for it</h2>
      <p>Agents and workflows can report &quot;done&quot; when the CRM record never saved or the email never went out. Tell ProofMyAI where the result should be, and it checks the real system. If the result isn&apos;t there, it checks again 30 seconds later, then raises a high alert.</p>
      <p><b>On an agent run</b>, add <code>verify</code> to your <code>/agent-runs</code> body (checked about 10 seconds after the run):</p>
      <Code>{`"verify": {"url": "https://api.yourcrm.com/v1/leads/8812", "headers": {"Authorization": "Bearer crm_key"},
           "expect_text": "sara@shop.co", "delay_seconds": 10}`}</Code>
      <p><b>From any workflow</b> (for example an n8n HTTP Request node after &quot;Create record&quot;):</p>
      <Code>{`curl -X POST ${API}/verify \
  -H "Authorization: Bearer ap_live_your_key" -H "Content-Type: application/json" \
  -d '{"name": "Lead sync", "reference": "lead 8812", "url": "https://api.yourcrm.com/v1/leads/8812",
       "headers": {"Authorization": "Bearer crm_key"}, "expect_text": "sara@shop.co"}'`}</Code>
      <p>Response: <code>{`{"passed": false, "detail": "api.yourcrm.com answered 404. The record may not exist."}`}</code>. Passes when the URL answers 2xx (or <code>expect_status</code>) and, if set, contains <code>expect_text</code>. Headers are used for the check only and are never stored. Only public URLs can be checked.</p>

      <h2 id="heartbeats">💓 Heartbeats: catch the job that never ran</h2>
      <p>Error handlers only fire when a job runs and fails. A cron that stopped, a dead server or a disabled trigger fails in silence. Add a heartbeat on the <em>n8n &amp; Make</em> page, then call its URL at the end of the job:</p>
      <Code>{`curl -fsS https://proofmyai.com/api/hb/hb_your_token          # finished OK
curl -fsS "https://proofmyai.com/api/hb/hb_your_token/fail?msg=disk%20full"   # report a failure now`}</Code>
      <p>If the check-in doesn&apos;t arrive within the schedule plus a grace period (20%, at least 5 minutes), you get an alert. It clears on the next check-in. No API key is needed: the URL is the secret, so keep it private.</p>

      <h2 id="crm">🗂️ CRM monitoring</h2>
      <p>Connect your CRM on the <em>CRM</em> page. It&apos;s read-only, and ProofMyAI stores only hashes and filled/empty flags, never names, emails or phone numbers. Direct connectors: <b>HubSpot, Salesforce, Pipedrive, Zoho CRM, GoHighLevel, Freshsales, Close, ActiveCampaign and Microsoft Dynamics 365</b>, checked every 15 minutes. You get alerts when new leads stop arriving (learned from your CRM&apos;s rhythm), new records miss an email/phone or owner, duplicates appear, hundreds of records change at once, leads aren&apos;t contacted in time, or the connection fails.</p>
      <p>For any other CRM (Monday, Attio, Copper, Keap, Bitrix24, Odoo, Airtable…), send records from n8n, Make or Zapier when they are created or updated:</p>
      <Code>{`curl -X POST ${API}/crm-records \
  -H "Authorization: Bearer ap_live_your_key" -H "Content-Type: application/json" \
  -d '{"source": "Monday CRM", "records": [{"id": "123", "kind": "lead", "created_at": "2026-10-18T09:30:00Z",
       "updated_at": "2026-10-18T09:30:00Z", "email": "sara@shop.co", "phone": "+44 7700 900123",
       "name": "Sara K.", "owner": "Ali", "last_activity_at": null}]}'`}</Code>
      <p>Response <code>202</code>: <code>{`{"received": 1, "new": 1, "duplicates": 0}`}</code>. Up to 500 records per call; <code>kind</code> is <code>contact</code>, <code>lead</code> or <code>deal</code>.</p>

      <h2 id="feedback">👍 POST /feedback: customer ratings</h2>
      <p>Send each thumbs up/down or star rating your customers give the bot. ProofMyAI shows customer satisfaction overall and per topic on the <em>Analytics</em> page. Use the same <code>conversation_id</code> you send to <code>/chat-events</code>.</p>
      <Code>{`curl -X POST ${API}/feedback \
  -H "Authorization: Bearer ap_live_your_key" -H "Content-Type: application/json" \
  -d '{"conversation_id": "chat-8812", "rating": "down", "comment": "Wrong delivery price"}'`}</Code>
      <p><code>rating</code>: <code>"up"</code> / <code>"down"</code>, <code>true</code> / <code>false</code>, whole stars <code>1</code>–<code>5</code>, or a decimal score from <code>0</code> to <code>1</code>. Optional: <code>turn_index</code> (which reply was rated) and <code>comment</code>. Response <code>201</code>: <code>{`{"ok": true, "id": 42}`}</code>.</p>

      <h2 id="agent-runs">🤖 POST /agent-runs: AI agent monitoring</h2>
      <p>Send one request when an agent run finishes. ProofMyAI checks it for loops, tool errors, runaway cost, slow runs, empty output and answers the tools didn&apos;t support.</p>
      <Fields rows={[
        ["run_id", "string, required", "Unique ID of this run. Sending the same run_id twice returns 409."],
        ["agent_name", "string, required", "Which agent ran, e.g. \"refund-agent\"."],
        ["goal", "string", "What the agent was asked to do."],
        ["status", "string", "success (default), error, timeout or cancelled. Send running when the run starts (just run_id and agent_name) to be alerted if it never finishes."],
        ["final_output", "string", "The agent's final answer or result."],
        ["steps", "array", "Each step: { type: llm | tool | retrieval | other, name, input, output, error, duration_ms, tokens, cost_usd }."],
      ]} />
      <Code>{`curl -X POST ${API}/agent-runs \\
  -H "Authorization: Bearer $PROOFMYAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "run_id": "run_2026_0412",
    "agent_name": "refund-agent",
    "goal": "Refund order #1043",
    "status": "success",
    "final_output": "Refund of $49 issued.",
    "steps": [
      {"type": "tool", "name": "lookup_order", "output": {"total": 49}, "duration_ms": 320},
      {"type": "tool", "name": "issue_refund", "error": "Payment API timeout", "duration_ms": 30000, "cost_usd": 0.002}
    ]
  }'`}</Code>
      <p>Response <code>201</code> (example):</p>
      <Code>{`{"id": 812, "score": 55, "issues": [
  {"code": "TOOL_ERRORS", "severity": "high", "message": "..."},
  {"code": "ENDED_ON_ERROR", "severity": "medium", "message": "The last step failed but the run still reported success."}]}`}</Code>
      <p>Issue codes: <code>RUN_FAILED</code>, <code>TOOL_ERRORS</code>, <code>LOOP_DETECTED</code>, <code>TOO_MANY_STEPS</code>, <code>OVER_BUDGET</code>, <code>SLOW_RUN</code>, <code>EMPTY_OUTPUT</code>, <code>ENDED_ON_ERROR</code>, <code>DESTRUCTIVE_ACTION</code>, plus from the AI review <code>GOAL_NOT_MET</code> and <code>UNGROUNDED_OUTPUT</code>. Set your step, cost and time limits in project Settings.</p>
      <p><b>Destructive actions.</b> Tool calls that delete, drop, wipe or overwrite data (a tool named <code>delete_record</code> or <code>volumeDelete</code>, <code>DROP TABLE</code>, <code>DELETE FROM</code> without <code>WHERE</code>, <code>rm -rf</code>, <code>git push --force</code>, an HTTP <code>DELETE</code>) are flagged <code>DESTRUCTIVE_ACTION</code>: high, with an alert, when they touch production, backups or everything at once. Send these actions to <a href="#approvals">/approvals</a> with <code>reversible: false</code> first. If a person approved one with the same <code>trace_id</code>, it is recorded but not alerted.</p>
      <p><b>Agents that go quiet.</b> ProofMyAI learns each agent&apos;s normal rhythm and alerts (<code>AGENT_STOPPED</code>) when it stops running, with no settings. To catch runs that start but never finish (hung, crashed, killed), send <code>{`{"run_id": "...", "agent_name": "...", "status": "running"}`}</code> when a run starts (answers <code>202</code>), then the finished run with the same <code>run_id</code>. Starts with no result are alerted as <code>AGENT_RUN_UNFINISHED</code>.</p>

      <h2 id="otel">📡 OpenTelemetry traces (no code changes)</h2>
      <p>Already instrumented with OpenTelemetry, or using a framework that is (LangChain/LangGraph, CrewAI, OpenAI Agents SDK, LlamaIndex, Vercel AI SDK, or OpenLLMetry/OpenInference instrumentation)? Point the exporter at ProofMyAI with three environment variables. Each finished trace becomes an agent run with the same checks: failed steps, loops, runaway cost and latency, empty output, and step-by-step timing.</p>
      <Code>{`OTEL_EXPORTER_OTLP_ENDPOINT=${SITE_URL}/api/v1/otel
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer ap_live_your_key
OTEL_EXPORTER_OTLP_PROTOCOL=http/json`}</Code>
      <p>Spans that follow the OpenTelemetry GenAI conventions (<code>gen_ai.*</code>) or OpenInference (<code>openinference.span.kind</code>, <code>input.value</code>, <code>output.value</code>) become LLM, tool and retrieval steps, with tokens, timing and errors. The agent name comes from <code>gen_ai.agent.name</code> or your <code>service.name</code>. Send OTLP as JSON; protobuf isn&apos;t supported yet.</p>

      <h2 id="calls">📞 POST /calls: voice bots and phone AI</h2>
      <p>Send each finished phone call. Every bot answer is checked like a chat reply, and the call is checked for the failure staff testing misses: the caller asked for a person and was never transferred, or the bot said it was transferring them and the transfer never happened.</p>
      <ul>
        <li><b>Vapi:</b> set your assistant&apos;s Server URL to <code>{`${API}/calls`}</code> with the header <code>Authorization: Bearer ap_live_...</code>. Only the <code>end-of-call-report</code> message is used; others are ignored.</li>
        <li><b>Retell:</b> set the agent&apos;s webhook URL to <code>{`${API}/calls?key=ap_live_...`}</code> (Retell can&apos;t add headers). The <code>call_ended</code> event is used.</li>
        <li><b>Any other provider:</b> POST the call as below.</li>
      </ul>
      <Fields rows={[
        ["call_id", "string, required", "Your id for the call. Sending the same call twice is ignored."],
        ["transcript", "array or string", "[{ role: user | assistant, content }], or text like \"AI: Hello\\nUser: Hi\"."],
        ["transferred", "boolean", "Whether the call was transferred to a person. If you can't tell, send ended_reason instead."],
        ["ended_reason", "string", "How the call ended, e.g. customer-hung-up or call_transfer."],
        ["bot_name", "string", "Optional: which voice bot."],
        ["duration_seconds", "number", "Optional."],
      ]} />
      <Code>{`curl -X POST ${API}/calls \\
  -H "Authorization: Bearer $PROOFMYAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"call_id": "c_1029", "bot_name": "Front desk", "transferred": false,
       "transcript": [{"role": "assistant", "content": "Village offices, how can I help?"},
                      {"role": "user", "content": "Can I speak to someone in Parks and Recreation?"},
                      {"role": "assistant", "content": "Sure, transferring you now."}]}'`}</Code>
      <p>Response <code>201</code>: <code>{`{"call_id": "c_1029", "answers_checked": 2, "issues": [{"code": "CALL_NOT_TRANSFERRED", "severity": "high", ...}]}`}</code>. Codes: <code>CALL_NOT_TRANSFERRED</code> (high, alerted) and <code>TRANSFER_NOT_OFFERED</code> (medium, when you don&apos;t send whether it transferred and the bot never offered to).</p>

      <h2 id="followups">🤝 Promised follow-ups: &quot;I&apos;ll get back to you&quot;</h2>
      <p>A reply like &quot;I&apos;ll check with the warehouse and get back to you&quot; breaks no policy, so answer checks pass it. But it&apos;s a promise, and if no task exists behind it the customer just waits. ProofMyAI tracks every promise in live chats until it&apos;s kept:</p>
      <ul>
        <li><b>A task exists:</b> send <code>task_id</code> with the bot&apos;s reply on <a href="#chat-events">/chat-events</a>, or call <code>POST /followups</code> when the task is created.</li>
        <li><b>The bot followed up:</b> a later bot reply in the same conversation that isn&apos;t another promise.</li>
      </ul>
      <p>Otherwise you get <code>PROMISE_NOT_KEPT</code> once the deadline passes (24 hours by default, set in Settings), and <code>PROMISE_CHASED</code> straight away if the customer writes &quot;any update?&quot; first. On <a href="#check">/check</a>, a reply that promises a follow-up without a <code>task_id</code> comes back as <code>review</code>, with <code>promise</code> and <code>promise_has_task: false</code>.</p>
      <Code>{`curl -X POST ${API}/followups \\
  -H "Authorization: Bearer $PROOFMYAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"conversation_id": "chat_8812", "bot_name": "Website bot", "task_id": "odoo-task-4471"}'`}</Code>
      <p>Use the same <code>conversation_id</code> and <code>bot_name</code> you send to /chat-events. Send <code>"status": "done"</code> if the follow-up already happened.</p>

      <h2 id="workflow-runs">⚙️ POST /workflow-runs: n8n, Make and Zapier</h2>
      <p>Most people connect n8n or Make with an API key instead (see above). Use this endpoint for Zapier, self-built pipelines, or to push runs yourself. Send one run or an array of up to 500.</p>
      <Fields rows={[
        ["workflow_id", "string, required", "Your workflow or scenario ID."],
        ["execution_id", "string, required", "Unique ID of this run (duplicates are ignored)."],
        ["status", "string, required", "success, error, warning, running, waiting, cancelled or crashed."],
        ["platform", "string", "n8n, make, zapier or other (default)."],
        ["workflow_name", "string", "Readable name shown in alerts."],
        ["started_at", "ISO 8601", "When the run started, with a time zone, e.g. 2026-09-29T10:15:00Z."],
        ["duration_ms", "number", "How long it took."],
        ["output_items", "integer", "How many items it produced. An empty \"success\" is flagged when it's unusual for this workflow (ProofMyAI learns its normal quiet spells)."],
        ["input_items", "integer", "How many items it received, e.g. new orders fetched. 0 in and 0 out is a quiet run (no alert); items in but 0 out is a high alert."],
        ["error_message", "string", "The error, if any."],
      ]} />
      <Code>{`curl -X POST ${API}/workflow-runs \\
  -H "Authorization: Bearer $PROOFMYAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '[{"platform": "zapier", "workflow_id": "order-sync", "workflow_name": "Shopify → Sheets",
        "execution_id": "ex_99121", "status": "success", "output_items": 0, "duration_ms": 2400}]'`}</Code>
      <p>Response <code>201</code>: <code>{`{"received": 1, "created": 1, "duplicates": 0}`}</code></p>

      <h2 id="errors">⚠️ Errors &amp; limits</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><code>400</code></td><td>Invalid JSON or a missing/invalid field. The <code>error</code> field says which one.</td></tr>
            <tr><td><code>401</code></td><td>Missing or wrong API key, or the account is suspended.</td></tr>
            <tr><td><code>402</code></td><td>Your plan&apos;s monthly limit is reached. Upgrade under Plan &amp; billing; nothing else breaks.</td></tr>
            <tr><td><code>409</code></td><td>An agent run with this <code>run_id</code> was already recorded.</td></tr>
            <tr><td><code>413</code></td><td>Body over 2 MB, or more than 500 workflow runs in one request.</td></tr>
            <tr><td><code>429</code></td><td>More than 600 requests per minute for one project. Retry after a short pause.</td></tr>
          </tbody>
        </table>
      </div>
      <p>Errors look like <code>{`{"error": "conversation_id: Required"}`}</code>. A service health check is available at <code>{SITE_URL}/api/health</code>, and live status at <Link href="/status">/status</Link>.</p>

      <h2 id="privacy">🔒 Privacy &amp; data</h2>
      <p>Emails, phone numbers, card numbers, IBANs, IP addresses and names are masked before storage or AI checks. Per project you can turn on results-only storage, set auto-delete, add your own words to mask, or switch AI checking off. Details in the <Link href="/security">Trust Center</Link>.</p>

      <p className="sub" style={{ marginTop: 28 }}>Stuck? <Link href="/support">Open a support ticket</Link> or message us on WhatsApp. See what&apos;s new in the <Link href="/changelog">changelog</Link>.</p>
    </PublicPage>
  );
}
