import { adminEmails } from "./admin";
import { all, get, run } from "./db";
import { sendMail } from "./email";
import { systemEmail } from "./emails";
import { SITE_URL } from "./seo";
import { CRON_INTERVAL_MIN } from "./status";
import { isStaleDeployError } from "./stale-deploy";

/**
 * Tells the site owner (ADMIN_EMAILS) when something breaks: a burst of server errors, or the scheduled
 * background checks (/api/cron) stop running. Errors are kept for 30 days and shown on the admin page.
 * Nothing here may throw: monitoring must never break the request it's watching.
 */
export const SPIKE_ERRORS = 5; // errors…
export const SPIKE_MINUTES = 10; // …within this many minutes trigger an alert
export const ALERT_GAP_MINUTES = 60; // at most one error alert per hour
export const CRON_LATE_MINUTES = CRON_INTERVAL_MIN * 3; // no cron run for 45 minutes = stopped

const iso = (d: Date) => d.toISOString();
const appUrl = () => (process.env.APP_URL || SITE_URL).replace(/\/+$/, "");

function beat(name: string): { last_run_at: string; ok: number; detail: string | null } | undefined {
  return get("SELECT last_run_at, ok, detail FROM heartbeats WHERE name = ?", name);
}
function setBeat(name: string, ok: boolean, detail: string, now: Date): void {
  run("INSERT INTO heartbeats (name, last_run_at, ok, detail) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at, ok = excluded.ok, detail = excluded.detail", name, iso(now), ok ? 1 : 0, detail.slice(0, 300));
}

export async function emailAdmins(mail: ReturnType<typeof systemEmail>, attachments?: { filename: string; content: Buffer }[]): Promise<number> {
  let sent = 0;
  for (const to of adminEmails()) {
    try {
      if (await sendMail(to, mail, { attachments })) sent++;
    } catch (err) {
      console.error("[monitoring] email to admin failed:", err instanceof Error ? err.message : err);
    }
  }
  return sent;
}

/** Ignores Next.js control flow (redirect / notFound), which is thrown but isn't an error. */
function isControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown })?.digest;
  return typeof digest === "string" && /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE)/.test(digest);
}

/** Records a server error and emails the admins when errors spike. */
export async function reportError(source: string, err: unknown, now = new Date()): Promise<void> {
  if (isControlFlow(err)) return;
  // A page left open across a deploy: the browser reloads itself, so it isn't a server error worth an alert.
  if (isStaleDeployError(err)) {
    console.warn(`[stale page] ${source}: form from an older version; the visitor's page reloads`);
    return;
  }
  try {
    const message = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).replace(/\s+/g, " ").slice(0, 500);
    console.error(`[error] ${source}: ${message}`);
    run("INSERT INTO server_errors (at, source, message) VALUES (?, ?, ?)", iso(now), source.slice(0, 200), message);
    const since = iso(new Date(now.getTime() - SPIKE_MINUTES * 60000));
    const recent = get<{ n: number }>("SELECT COUNT(*) AS n FROM server_errors WHERE at >= ?", since)?.n ?? 0;
    if (recent < SPIKE_ERRORS) return;
    const last = beat("error_alert");
    if (last && now.getTime() - Date.parse(last.last_run_at) < ALERT_GAP_MINUTES * 60000) return;
    setBeat("error_alert", false, `${recent} errors`, now); // claim the slot first so parallel errors don't double-send
    const latest = all<{ at: string; source: string; message: string }>("SELECT at, source, message FROM server_errors WHERE at >= ? ORDER BY id DESC LIMIT 5", since);
    await emailAdmins(systemEmail(`🚨 ${recent} server errors in ${SPIKE_MINUTES} minutes · ProofMyAI`, {
      icon: "🚨", tone: "bad", title: `${recent} errors in the last ${SPIKE_MINUTES} minutes`,
      paragraphs: ["ProofMyAI's server is hitting errors more often than usual. Customers may be seeing error pages or missing alerts.", "Most recent errors:"],
      bullets: latest.map((e) => `${e.at.slice(11, 19)} UTC · ${e.source} · ${e.message.slice(0, 220)}`),
      facts: [["What to check", "Railway → your service → Deployments → View logs"], ["Next alert", `At most one per ${ALERT_GAP_MINUTES} minutes`]],
      cta: { label: "Open admin dashboard", url: `${appUrl()}/app/admin#system` },
    }));
  } catch (e) {
    console.error("[monitoring] could not record error:", e instanceof Error ? e.message : e);
  }
}

/** Alerts once when the 15-minute background checks stop, and again when they're back. Run every minute. */
export async function checkCronHealth(now = new Date()): Promise<"ok" | "late" | "recovered" | "alerted" | "unknown"> {
  try {
    const cron = beat("cron");
    if (!cron) return "unknown"; // never ran: the cron job hasn't been set up yet
    const late = now.getTime() - Date.parse(cron.last_run_at) > CRON_LATE_MINUTES * 60000;
    const alert = beat("cron_alert");
    const open = alert?.ok === 0;
    if (late && !open) {
      setBeat("cron_alert", false, "stopped", now);
      await emailAdmins(systemEmail("🔴 Background checks stopped · ProofMyAI", {
        icon: "⏱️", tone: "bad", title: "Background checks have stopped running",
        paragraphs: [
          `The scheduled job that calls /api/cron every ${CRON_INTERVAL_MIN} minutes last ran ${Math.round((now.getTime() - Date.parse(cron.last_run_at)) / 60000)} minutes ago. While it's stopped, nightly bot tests, n8n/Make polling, Intercom/WhatsApp imports and weekly reports don't run.`,
          "How to fix: open cron-job.org → your ProofMyAI job → check it's enabled and the last runs succeeded (it should call https://proofmyai.com/api/cron with your CRON_SECRET). Also check Railway shows the service as running.",
        ],
        facts: [["Last run", `${cron.last_run_at.replace("T", " ").slice(0, 16)} UTC`], ["Last result", cron.ok ? "OK" : `Error: ${cron.detail ?? "unknown"}`]],
        cta: { label: "Open status page", url: `${appUrl()}/status` },
      }));
      return "alerted";
    }
    if (!late && open) {
      setBeat("cron_alert", true, "running", now);
      await emailAdmins(systemEmail("✅ Background checks are running again · ProofMyAI", {
        icon: "✅", tone: "ok", title: "Background checks are running again",
        paragraphs: ["The scheduled job is calling /api/cron again. Nothing else to do."],
      }));
      return "recovered";
    }
    return late ? "late" : "ok";
  } catch (e) {
    console.error("[monitoring] cron check failed:", e instanceof Error ? e.message : e);
    return "unknown";
  }
}

export function recentErrors(limit = 15): { at: string; source: string; message: string }[] {
  return all("SELECT at, source, message FROM server_errors ORDER BY id DESC LIMIT ?", limit);
}
export function errorCount(hours: number, now = new Date()): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM server_errors WHERE at >= ?", iso(new Date(now.getTime() - hours * 3600000)))?.n ?? 0;
}
export function purgeOldErrors(days = 30, now = new Date()): number {
  return run("DELETE FROM server_errors WHERE at < ?", iso(new Date(now.getTime() - days * 86400000))).changes;
}
