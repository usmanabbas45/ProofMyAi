import { all, get, run } from "./db";
import type { Mail } from "./email";
import { sendMail } from "./email";
import { compose } from "./emails";
import { SITE_URL } from "./seo";
import { durationLabel, lastDays, money, periodFor, reportFor, valueShareToken, type ValueReport } from "./valuereport";

/**
 * Scheduled client reports: the "Proof of value" summary emailed to the client's own addresses every Monday
 * (last 7 days) or on the 1st of the month (last calendar month), branded with the agency's name. Nobody has to
 * open ProofMyAI or remember to send anything.
 */

export type ReportFreq = "weekly" | "monthly";
export const MAX_RECIPIENTS = 5;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const SEND_HOUR_UTC = 6;

export function parseRecipients(raw: string): { ok: true; emails: string[] } | { ok: false; error: string } {
  const emails = [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return { ok: false, error: "Add at least one email address." };
  if (emails.length > MAX_RECIPIENTS) return { ok: false, error: `Up to ${MAX_RECIPIENTS} email addresses per project.` };
  const bad = emails.find((e) => !EMAIL.test(e) || e.length > 200);
  if (bad) return { ok: false, error: `"${bad.slice(0, 60)}" isn't a valid email address.` };
  return { ok: true, emails };
}

export interface ClientReportSettings { emails: string[]; freq: ReportFreq | null; lastAt: string | null }

export function clientReportSettings(projectId: number): ClientReportSettings {
  const r = get<{ e: string | null; f: string | null; l: string | null }>("SELECT client_report_emails AS e, client_report_freq AS f, client_report_last_at AS l FROM projects WHERE id = ?", projectId);
  return { emails: r?.e ? r.e.split(",").filter(Boolean) : [], freq: r?.f === "weekly" || r?.f === "monthly" ? r.f : null, lastAt: r?.l ?? null };
}

/** Saving starts the clock, so the first report goes out at the next Monday or 1st, not straight away. */
export function saveClientReport(projectId: number, emails: string[], freq: ReportFreq | null, now = new Date()): void {
  run("UPDATE projects SET client_report_emails = ?, client_report_freq = ?, client_report_last_at = ? WHERE id = ?",
    emails.join(","), freq, freq ? now.toISOString() : null, projectId);
}

/** Start of the current reporting slot: this week's Monday or this month's 1st, at 06:00 UTC. */
export function slotStart(freq: ReportFreq, now: Date): Date {
  if (freq === "monthly") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, SEND_HOUR_UTC));
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday, SEND_HOUR_UTC));
}

export function isDue(freq: ReportFreq, lastAt: string | null, now: Date): boolean {
  const slot = slotStart(freq, now);
  return now >= slot && (!lastAt || new Date(lastAt) < slot);
}

/** When the next report goes out. */
export function nextSendAt(freq: ReportFreq, lastAt: string | null, now = new Date()): Date {
  if (isDue(freq, lastAt, now)) return now;
  const slot = slotStart(freq, now);
  if (now < slot) return slot;
  return freq === "monthly"
    ? new Date(Date.UTC(slot.getUTCFullYear(), slot.getUTCMonth() + 1, 1, SEND_HOUR_UTC))
    : new Date(slot.getTime() + 7 * 86400000);
}

/** The period a report covers: the previous calendar month, or the last 7 days. */
export function reportPeriod(freq: ReportFreq, now: Date) {
  if (freq === "weekly") return { ...lastDays(7, now), month: undefined as string | undefined };
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const month = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  return { ...periodFor(month, now), month };
}

export function clientReportEmail(r: ValueReport, opts: { brand: string; project: string; link: string; freq: ReportFreq }): Mail {
  const v = r.now;
  const watched = v.answersChecked + v.agentRunsWatched + v.workflowRunsWatched;
  const when = opts.freq === "monthly" ? r.period.label : "this week";
  const lead = r.highlights.length
    ? `Here's what ${opts.brand} caught and fixed for ${opts.project} ${opts.freq === "monthly" ? `in ${r.period.label}` : "over the last 7 days"}.`
    : watched
      ? `Everything ran cleanly ${opts.freq === "monthly" ? `in ${r.period.label}` : "this week"}: ${watched.toLocaleString("en-GB")} answers, agent runs and workflow runs were checked and nothing needed action.`
      : `Nothing was checked ${opts.freq === "monthly" ? `in ${r.period.label}` : "this week"}. If that's unexpected, a connection may have stopped sending data.`;
  const facts: [string, string][] = [
    ["Wrong replies blocked before sending", String(v.blockedBeforeSending)],
    ["Risky AI actions stopped", v.actionsRejected ? `${v.actionsRejected}${v.rejectedValue.length ? ` (worth ${v.rejectedValue.map(money).join(" + ")})` : ""}` : "0"],
    ["Silent failures caught", String(v.silentFailures)],
    ["Problems fixed", v.problemsResolved ? `${v.problemsResolved}${v.medianFixMinutes != null ? `, typically within ${durationLabel(v.medianFixMinutes)}` : ""}` : "0"],
    ["Checked around the clock", `${v.answersChecked.toLocaleString("en-GB")} chatbot answers · ${v.agentRunsWatched.toLocaleString("en-GB")} agent runs · ${v.workflowRunsWatched.toLocaleString("en-GB")} workflow runs`],
  ];
  return compose(
    `Your AI & automation report · ${opts.freq === "monthly" ? r.period.label : "this week"} · ${opts.project}`,
    r.highlights[0] ?? lead,
    {
      brand: opts.brand,
      icon: "🏆",
      badge: { text: opts.freq === "monthly" ? "MONTHLY REPORT" : "WEEKLY REPORT", color: "#5b4bf5", bg: "#eeebff" },
      title: r.highlights.length ? `${r.highlights.length} thing${r.highlights.length === 1 ? "" : "s"} caught for you ${when}` : `Your AI & automations ${when}`,
      paragraphs: [lead],
      ...(r.highlights.length ? { bullets: r.highlights.map((h) => `✅ ${h}`) } : {}),
      facts,
      cta: { label: "Open the full report", url: opts.link },
      after: ["Every number is a count of real events. Nothing is estimated."],
    },
    `You receive this because ${opts.brand} set up ${opts.freq} reports for ${opts.project}. Reply to this email to change or stop them.`,
  );
}

interface DueProject { id: number; name: string; brand: string | null; emails: string; freq: ReportFreq; last: string | null; owner: string }

function buildFor(p: { id: number; name: string; brand: string | null }, freq: ReportFreq, now: Date): Mail {
  const per = reportPeriod(freq, now);
  const token = valueShareToken(p.id, true)!;
  const base = (process.env.APP_URL || SITE_URL).replace(/\/+$/, "");
  const link = `${base}/v/${token}${per.month ? `?m=${per.month}` : ""}`;
  return clientReportEmail(reportFor(p.id, per), { brand: p.brand || "ProofMyAI", project: p.name, link, freq });
}

/** Sends every client report that is due. Called from the cron endpoint (every 15 minutes). */
export async function sendDueClientReports(now = new Date()): Promise<number> {
  if (!process.env.RESEND_API_KEY) return 0;
  const due = all<DueProject>(
    `SELECT p.id, p.name, p.report_brand AS brand, p.client_report_emails AS emails, p.client_report_freq AS freq, p.client_report_last_at AS last, u.email AS owner
       FROM projects p JOIN users u ON u.id = p.user_id
      WHERE p.is_demo = 0 AND p.client_report_freq IN ('weekly', 'monthly') AND p.client_report_emails IS NOT NULL AND p.client_report_emails <> ''`,
  ).filter((p) => isDue(p.freq, p.last, now));
  let sent = 0;
  for (const p of due) {
    // Mark first so a slow or failing send can't email the client twice.
    run("UPDATE projects SET client_report_last_at = ? WHERE id = ?", now.toISOString(), p.id);
    const mail = buildFor(p, p.freq, now);
    for (const to of p.emails.split(",").filter(Boolean)) {
      try {
        if (await sendMail(to, mail, { replyTo: p.owner, fromName: p.brand || "ProofMyAI" })) sent++;
      } catch (err) {
        console.error(`[client-report] project ${p.id} to ${to} failed:`, err);
      }
    }
  }
  return sent;
}

/** A preview of the next report, sent to the person setting it up. */
export async function sendTestClientReport(projectId: number, to: string, freq: ReportFreq, now = new Date()): Promise<boolean> {
  const p = get<{ id: number; name: string; brand: string | null }>("SELECT id, name, report_brand AS brand FROM projects WHERE id = ?", projectId);
  if (!p) return false;
  const mail = buildFor(p, freq, now);
  return sendMail(to, { ...mail, subject: `[Test] ${mail.subject}` }, { fromName: p.brand || "ProofMyAI" });
}
