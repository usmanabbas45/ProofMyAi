import crypto from "node:crypto";
import { all } from "@/lib/db";
import { sendDueDigests } from "@/lib/digest";
import { sendDueClientReports } from "@/lib/clientreport";
import { purgeExpired } from "@/lib/retention";
import { recordCronRun } from "@/lib/status";
import { processFoundingPeriods } from "@/lib/founding";
import { recordDailyMetrics } from "@/lib/analytics";
import { alertMissingReplies } from "@/lib/audit/live";
import { pollAllChatSources } from "@/lib/connectors";
import { runDueSuites } from "@/lib/tests/runner";
import { periodicWorkflowChecks } from "@/lib/workflows/monitor";
import { pollAllSources } from "@/lib/workflows/pollers";
import { runDueMonitors } from "@/lib/uptime";
import { runDueSheets } from "@/lib/sheets";
import { expireApprovals } from "@/lib/approvals";
import { checkHeartbeats } from "@/lib/heartbeats";
import { qualityChecks } from "@/lib/drift";
import { pollAllCrms } from "@/lib/crm/monitor";
import { purgeOldErrors } from "@/lib/monitoring";
import { sendDueOnboarding } from "@/lib/onboarding";
import { sendRenewalReminders } from "@/lib/renewals";
import { applyPendingRewards } from "@/lib/referrals";
import { autoGenerateTests } from "@/lib/testgen";
import { evaluateAllWatches } from "@/lib/watches";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || new URL(req.url).searchParams.get("secret") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Call every 15 minutes: polls n8n/Make, runs periodic checks, and runs chatbot test suites due in the last 24h. */
export async function GET(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const started = Date.now();
  try {
    return await runAll(started);
  } catch (err) {
    recordCronRun(false, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function runAll(started: number) {
  await pollAllSources();
  await pollAllCrms();
  const projects = all<{ id: number }>("SELECT id FROM projects WHERE is_demo = 0"); // demo data is never "live"
  for (const p of projects) {
    await periodicWorkflowChecks(p.id);
    await qualityChecks(p.id);
  }
  expireApprovals();
  await checkHeartbeats();
  const suites = await runDueSuites();
  const digests = await sendDueDigests();
  const clientReports = await sendDueClientReports();
  const welcomeEmails = await sendDueOnboarding();
  const renewalReminders = await sendRenewalReminders();
  const referralRewards = await applyPendingRewards();
  const testsGenerated = await autoGenerateTests();
  const chatSources = await pollAllChatSources();
  const noReply = await alertMissingReplies();
  const uptimeChecks = await runDueMonitors();
  const sheetChecks = await runDueSheets();
  const watchAlerts = await evaluateAllWatches();
  const purged = purgeExpired();
  purgeOldErrors();
  const founding = await processFoundingPeriods();
  recordDailyMetrics();
  recordCronRun(true);
  return Response.json({ ok: true, projects: projects.length, testSuitesRun: suites, digestsSent: digests, clientReportsSent: clientReports, welcomeEmails, renewalReminders, referralRewards, testsGenerated, chatSources, unansweredAlerted: noReply, uptimeChecks, sheetChecks, watchAlerts, purged, founding, ms: Date.now() - started });
}
