import type { Mail } from "./email";
import { FOUNDING_OFFER } from "./testimonials";
import { SITE_URL, SUPPORT_EMAIL } from "./seo";

/**
 * Branded, email-client-safe templates (table layout, inline styles, 600px, light background that
 * also reads well when clients invert colours). Every email has a plain-text version too.
 */

const BRAND = "#5b4bf5";
const TEXT = "#0f1729";
const MUTED = "#5b6478";
const BORDER = "#e3e6ef";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const appUrl = () => (process.env.APP_URL || SITE_URL).replace(/\/+$/, "");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export interface Block {
  /** Large icon above the title (emoji render as colour icons in every mail client). */
  icon?: string;
  /** Small coloured label above the title, e.g. "HIGH SEVERITY". */
  badge?: { text: string; color: string; bg: string };
  title: string;
  /** Paragraphs (plain text; escaped). */
  paragraphs?: string[];
  /** Label/value rows shown in a grey box. */
  facts?: [string, string][];
  /** A quoted message (ticket reply, customer text). */
  quote?: string;
  /** Bulleted list. */
  bullets?: string[];
  cta?: { label: string; url: string };
  /** Small text after the button. */
  after?: string[];
  /** White-label: an agency's name replaces the ProofMyAI header and footer links (client reports). */
  brand?: string;
}

function renderHtml(preheader: string, b: Block, footer: string): string {
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXT};">${esc(t).replace(/\n/g, "<br>")}</p>`;
  const icon = b.icon ? `<div style="width:52px;height:52px;line-height:52px;text-align:center;border-radius:14px;background:${b.badge?.bg ?? "#eeebff"};font-size:26px;margin:0 0 16px;">${b.icon}</div>` : "";
  const badge = b.badge ? `<div style="display:inline-block;margin:0 0 14px;padding:4px 10px;border-radius:999px;background:${b.badge.bg};color:${b.badge.color};font-size:12px;font-weight:700;letter-spacing:.4px;">${esc(b.badge.text)}</div>` : "";
  const facts = b.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:#f6f7fb;border:1px solid ${BORDER};border-radius:10px;">${b.facts
        .map(([k, v], i) => `<tr><td style="padding:10px 14px;${i ? `border-top:1px solid ${BORDER};` : ""}font-size:13px;color:${MUTED};width:38%;vertical-align:top;">${esc(k)}</td><td style="padding:10px 14px;${i ? `border-top:1px solid ${BORDER};` : ""}font-size:14px;color:${TEXT};vertical-align:top;word-break:break-word;">${esc(v)}</td></tr>`)
        .join("")}</table>`
    : "";
  const quote = b.quote ? `<div style="margin:0 0 18px;padding:14px 16px;border-left:4px solid ${BRAND};background:#f4f2ff;border-radius:6px;font-size:15px;line-height:1.6;color:${TEXT};">${esc(b.quote).replace(/\n/g, "<br>")}</div>` : "";
  const bullets = b.bullets?.length ? `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:${TEXT};">${b.bullets.map((x) => `<li style="margin:0 0 6px;">${esc(x)}</li>`).join("")}</ul>` : "";
  const cta = b.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td style="border-radius:10px;background:${BRAND};"><a href="${esc(b.cta.url)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(b.cta.label)} &rarr;</a></td></tr></table>`
    : "";
  const after = (b.after ?? []).map((t) => `<p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:${MUTED};">${esc(t)}</p>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(b.title)}</title></head>
<body style="margin:0;padding:0;background:#f1f3f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f9;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="padding:0 4px 16px;">
  ${b.brand ? `<span style="color:${TEXT};font-size:18px;font-weight:800;">${esc(b.brand)}</span>` : `<a href="${esc(SITE_URL)}" style="text-decoration:none;color:${TEXT};font-size:18px;font-weight:800;"><img src="${esc(SITE_URL)}/icon.png" width="30" height="30" alt="ProofMyAI" style="display:inline-block;width:30px;height:30px;border:0;border-radius:8px;margin-right:9px;vertical-align:middle;"><span style="vertical-align:middle;">ProofMyAI</span></a>`}
</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:30px 28px;">
  ${icon}${badge}
  <h1 style="margin:0 0 16px;font-size:21px;line-height:1.35;color:${TEXT};">${esc(b.title)}</h1>
  ${(b.paragraphs ?? []).map(p).join("")}${quote}${facts}${bullets}${cta}${after}
</td></tr>
<tr><td style="padding:18px 8px;text-align:center;font-size:12px;line-height:1.6;color:${MUTED};">
  ${footer}<br>
  ${b.brand ? `Prepared by ${esc(b.brand)} &middot; monitoring by ProofMyAI` : `<a href="${esc(appUrl())}/app" style="color:${MUTED};">Dashboard</a> &middot; <a href="${esc(SITE_URL)}/status" style="color:${MUTED};">Status</a> &middot; <a href="${esc(SITE_URL)}/support" style="color:${MUTED};">Support</a> &middot; <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:${MUTED};">${esc(SUPPORT_EMAIL)}</a><br>
  ProofMyAI &middot; Quality monitoring for AI chatbots, agents, automations and CRMs`}
</td></tr>
</table></td></tr></table></body></html>`;
}

function renderText(b: Block, footer: string): string {
  const out = [`${b.icon ? `${b.icon} ` : ""}${b.badge ? `[${b.badge.text}] ` : ""}${b.title}`, ""];
  for (const p of b.paragraphs ?? []) out.push(p, "");
  if (b.quote) out.push(b.quote.split("\n").map((l) => `> ${l}`).join("\n"), "");
  if (b.facts?.length) out.push(...b.facts.map(([k, v]) => `${k}: ${v}`), "");
  if (b.bullets?.length) out.push(...b.bullets.map((x) => `- ${x}`), "");
  if (b.cta) out.push(`${b.cta.label}: ${b.cta.url}`, "");
  if (b.after?.length) out.push(...b.after, "");
  out.push("--", footer.replace(/<[^>]+>/g, ""), b.brand ? `Prepared by ${b.brand} · monitoring by ProofMyAI` : `ProofMyAI · ${SITE_URL} · Support: ${SUPPORT_EMAIL}`);
  return out.join("\n");
}

export function compose(subject: string, preheader: string, b: Block, footer = "You're receiving this because you have a ProofMyAI account.", manage?: { label: string; url: string }): Mail {
  const html = esc(footer) + (manage ? ` <a href="${esc(manage.url)}" style="color:${MUTED};">${esc(manage.label)}</a>` : "");
  return { subject, text: renderText(b, manage ? `${footer} ${manage.label}: ${manage.url}` : footer), html: renderHtml(preheader, b, html) };
}

// ── Alerts ──────────────────────────────────────────────────────────────────

const SEVERITY_STYLE = {
  high: { text: "HIGH SEVERITY", color: "#b42335", bg: "#fde8eb", label: "High" },
  medium: { text: "MEDIUM SEVERITY", color: "#9a6100", bg: "#fdf3dc", label: "Medium" },
  low: { text: "LOW SEVERITY", color: "#1f5fae", bg: "#e4f0fd", label: "Low" },
} as const;
const MODULE_LABEL: Record<string, string> = { chatbot: "Chatbot", tests: "Chatbot tests", agents: "AI agents", workflows: "n8n & Make workflows", uptime: "Uptime" };
const NEXT_STEP: Record<string, string> = {
  NO_REPLY: "Check that your bot is online and still sending replies to ProofMyAI. If customers are waiting, answer them manually while you fix it.",
  TEST_ALERT: "Nothing to fix. This confirms the channel works.",
};
const MODULE_STEP: Record<string, string> = {
  chatbot: "Open the incident to see the exact answers, then update the help article or rule that caused them.",
  tests: "Open the incident to compare the new answer with the expected facts.",
  agents: "Open the incident to see the run's steps, tool errors and cost.",
  workflows: "Open the incident to see the failing executions and error messages.",
  uptime: "Open the URL in your browser to confirm, then check your hosting or bot provider's status page.",
};

export interface AlertInput {
  projectName: string;
  kind: "problem" | "resolved";
  module: string;
  code: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  link: string;
}

export function alertEmail(m: AlertInput, recipient: string): Mail {
  const isTest = m.code === "TEST_ALERT";
  const sev = SEVERITY_STYLE[m.severity];
  const settings = m.link.replace(/\/incidents$/, "/settings#notifications");
  const badge = isTest ? { text: "TEST ALERT", color: "#1f5fae", bg: "#e4f0fd" } : m.kind === "resolved" ? { text: "RESOLVED", color: "#0b7a52", bg: "#e3f7ee" } : sev;
  const subject = isTest ? `Test alert · ${m.projectName}` : m.kind === "resolved" ? `Resolved: ${m.title} · ${m.projectName}` : `[${sev.label}] ${m.title} · ${m.projectName}`;
  const detected = new Date().toUTCString().replace(" GMT", " UTC");
  const icon = isTest ? "🔔" : m.kind === "resolved" ? "✅" : m.severity === "high" ? "🚨" : m.severity === "medium" ? "⚠️" : "ℹ️";
  return compose(subject, m.detail, {
    icon,
    badge,
    title: isTest ? "Your alerts are working" : m.title,
    paragraphs: isTest ? [`This is a test from ProofMyAI. Real problems in "${m.projectName}" will arrive at this address like this one.`] : [m.kind === "resolved" ? "Good news: this problem is no longer happening. No action is needed." : m.detail],
    facts: [["📁 Project", m.projectName], ["🧩 Area", MODULE_LABEL[m.module] ?? m.module], ...(isTest ? [] : [["🎯 Severity", sev.label] as [string, string]]), [m.kind === "resolved" ? "✅ Resolved" : "🕒 Detected", detected]],
    ...(m.kind === "problem" ? { after: [`💡 What to do: ${NEXT_STEP[m.code] ?? MODULE_STEP[m.module] ?? "Open the incident for details."}`] } : {}),
    cta: { label: isTest ? "Open dashboard" : m.kind === "resolved" ? "View incidents" : "View incident", url: m.link },
  }, `You're receiving this because ${recipient} is an alert channel for "${m.projectName}".`, { label: "Manage alerts", url: settings });
}

// ── Account ─────────────────────────────────────────────────────────────────

export function inviteEmail(inviter: string, projectName: string, role: "viewer" | "editor", link: string, days: number): Mail {
  const what = role === "editor" ? "view results and connect chatbots, agents and workflows" : "view results and reports";
  return compose(`${inviter} invited you to ${projectName} on ProofMyAI`, `Join ${projectName} as ${role === "editor" ? "an editor" : "a viewer"}.`, {
    icon: "👋",
    title: `Join ${projectName} on ProofMyAI`,
    paragraphs: [`${inviter} invited you to the ${projectName} project as ${role === "editor" ? "an editor" : "a viewer"}, so you can ${what}.`],
    cta: { label: "Accept invitation", url: link },
    after: [`The invitation expires in ${days} days. Log in or create a free account with this email address to accept it.`, `Button not working? Copy this link into your browser: ${link}`],
  }, "You're receiving this because someone invited this email address to a ProofMyAI project.");
}

export function passwordResetEmail(link: string, minutes: number): Mail {
  return compose("Reset your ProofMyAI password", "Use this link to choose a new password.", {
    icon: "🔑",
    title: "Reset your password",
    paragraphs: ["We received a request to reset the password for your ProofMyAI account. Click the button to choose a new one."],
    cta: { label: "Choose a new password", url: link },
    after: [`This link works once and expires in ${minutes} minutes.`, "If you didn't ask for this, you can ignore this email. Your password stays the same.", `Button not working? Copy this link into your browser: ${link}`],
  }, "You're receiving this because a password reset was requested for your ProofMyAI account.");
}

export function verifyEmail(link: string, hours: number): Mail {
  return compose("Confirm your email for ProofMyAI", "One click to confirm your email and switch on alerts.", {
    icon: "✉️",
    title: "Confirm your email address",
    paragraphs: ["Welcome to ProofMyAI! Please confirm this is your email address. Until you do, we can't send alerts or team invitations from your account."],
    cta: { label: "Confirm my email", url: link },
    after: [`This link expires in ${hours} hours. You can send a new one from your dashboard at any time.`, "If you didn't create a ProofMyAI account, you can ignore this email.", `Button not working? Copy this link into your browser: ${link}`],
  }, "You're receiving this because this email address was used to sign up to ProofMyAI.");
}

/** System email to the site owner (backups, error spikes, stopped background checks). */
export function systemEmail(subject: string, o: { icon: string; tone: "ok" | "bad" | "info"; title: string; paragraphs: string[]; facts?: [string, string][]; bullets?: string[]; cta?: { label: string; url: string } }): Mail {
  const badge = o.tone === "bad" ? { text: "ACTION NEEDED", color: "#b42335", bg: "#fde8eb" } : o.tone === "ok" ? { text: "ALL GOOD", color: "#0b7a52", bg: "#e3f7ee" } : { text: "SYSTEM", color: "#1f5fae", bg: "#e4f0fd" };
  return compose(subject, o.paragraphs[0] ?? o.title, { icon: o.icon, badge, title: o.title, paragraphs: o.paragraphs, facts: o.facts, bullets: o.bullets, cta: o.cta }, "You're receiving this because your address is in ADMIN_EMAILS on the ProofMyAI server.");
}

// ── Weekly summary ──────────────────────────────────────────────────────────

export interface DigestData {
  projectId: number;
  projectName: string;
  score: number | null;
  modules: [string, number | null, string][];
  answers: number;
  bad: number;
  newIncidents: number;
  openIncidents: number;
  top: string[];
  /** Trust score, approvals, CRM, sheets and heartbeats: shown only for what the project uses. */
  extras?: [string, string][];
}

export function digestEmail(d: DigestData, unsubscribe?: { url: string; headers: Record<string, string> }): Mail {
  const base = `${appUrl()}/app/p/${d.projectId}`;
  const summary = d.openIncidents ? `${d.openIncidents} open incident${d.openIncidents === 1 ? "" : "s"} need${d.openIncidents === 1 ? "s" : ""} attention.` : "No open incidents. Everything looks healthy.";
  const mail = compose(`Weekly AI quality summary · ${d.projectName}`, `AI Health ${d.score ?? "–"}/100. ${summary}`, {
    icon: "📊",
    badge: { text: "WEEKLY SUMMARY", color: BRAND, bg: "#eeebff" },
    title: `AI Health score: ${d.score ?? "–"}/100`,
    paragraphs: [`Here's how the AI systems in "${d.projectName}" performed over the last 7 days. ${summary}`],
    facts: [
      ...d.modules.map(([label, score, detail]) => [label, score == null ? "Not set up" : `${score}% · ${detail}`] as [string, string]),
      ["🔍 Answers checked", `${d.answers} (${d.bad} with problems)`],
      ["🚨 Incidents", `${d.newIncidents} new this week · ${d.openIncidents} open`],
      ...(d.extras ?? []),
    ],
    ...(d.top.length ? { bullets: d.top.map((t) => `⚠️ ${t}`) } : {}),
    cta: { label: "Open your dashboard", url: base },
  }, `You're receiving this weekly summary for "${d.projectName}".`, unsubscribe ? { label: "Unsubscribe", url: unsubscribe.url } : { label: "Turn off weekly summaries", url: `${base}/settings` });
  return unsubscribe ? { ...mail, headers: unsubscribe.headers } : mail;
}

// ── Support ─────────────────────────────────────────────────────────────────

export function ticketReceivedEmail(code: string, subject: string, name: string | null): Mail {
  return compose(`We received your request · ${code}`, `Ticket ${code}: we'll reply within one business day.`, {
    icon: "🎫",
    badge: { text: `TICKET ${code}`, color: BRAND, bg: "#eeebff" },
    title: "We've got your message",
    paragraphs: [`Hi${name ? ` ${name}` : ""}, thanks for getting in touch. Your ticket "${subject}" is in our queue, and we usually reply within one business day.`, "To add details or screenshots, just reply to this email."],
    cta: { label: "Track your tickets", url: `${appUrl()}/app/support` },
  }, "You're receiving this because you submitted a support request to ProofMyAI.");
}

export function ticketReplyEmail(code: string, subject: string, name: string | null, reply: string, closed: boolean, whatsapp: string): Mail {
  return compose(`Re: ${subject} · ${code}`, reply.slice(0, 120), {
    icon: closed ? "✅" : "💬",
    badge: { text: closed ? `TICKET ${code} · SOLVED` : `TICKET ${code}`, color: closed ? "#0b7a52" : BRAND, bg: closed ? "#e3f7ee" : "#eeebff" },
    title: `Reply to "${subject}"`,
    paragraphs: [`Hi${name ? ` ${name}` : ""},`],
    quote: reply,
    cta: { label: "View your ticket", url: `${appUrl()}/app/support` },
    after: [closed ? "We've marked this ticket as solved. Reply to this email if you need anything else and we'll reopen it." : "Reply to this email to continue the conversation.", `📱 Urgent? Message us on WhatsApp: ${whatsapp}`],
  }, "You're receiving this because you contacted ProofMyAI support.");
}

/** Internal notification to the support inbox. */
export function internalEmail(subject: string, title: string, facts: [string, string][], message: string, cta?: { label: string; url: string }): Mail {
  return compose(subject, message.slice(0, 120), { icon: "📥", badge: { text: "INTERNAL", color: MUTED, bg: "#f1f3f9" }, title, facts, quote: message, ...(cta ? { cta } : {}) }, "Internal notification from your ProofMyAI server.");
}

// ── Founding customers ──────────────────────────────────────────────────────

export function foundingWelcomeEmail(endsAt: string): Mail {
  return compose("Welcome, founding customer 🎉", `Your Growth plan is free until ${day(endsAt)}.`, {
    icon: "🎉",
    badge: { text: "FOUNDING CUSTOMER", color: "#0b7a52", bg: "#e3f7ee" },
    title: "Your Growth plan is active",
    paragraphs: [`Thank you for being one of our first customers. Your account now has the Growth plan for free until ${day(endsAt)}. Nothing will be charged.`],
    bullets: ["📁 3 projects and 3,000 audited conversations a month", "🧪 Nightly tests for 5 bots", "⚙️ Unlimited workflows and agents", "📱 Direct WhatsApp access to the developer"],
    cta: { label: "Open your dashboard", url: `${appUrl()}/app` },
    after: [`In return we'd love ${FOUNDING_OFFER.ask}. You can share it any time from "Share feedback" in your dashboard.`, "We'll email you a week before the free period ends. If you don't subscribe, your account simply moves to the Free plan and keeps all its data."],
  });
}

export function foundingEndingEmail(endsAt: string): Mail {
  return compose("Your free Growth plan ends in 7 days", `Keep your Growth features after ${day(endsAt)}.`, {
    icon: "⏳",
    badge: { text: "FOUNDING CUSTOMER", color: "#9a6100", bg: "#fdf3dc" },
    title: `Your free period ends on ${day(endsAt)}`,
    paragraphs: ["We hope ProofMyAI has been catching problems before your customers do. To keep the Growth plan, choose it on the billing page: you'll get a 14-day free trial and a 14-day money-back guarantee.", "If you do nothing, your account moves to the Free plan (50 conversations a month) and keeps all its data. Nothing is charged automatically."],
    cta: { label: "Choose a plan", url: `${appUrl()}/app/billing` },
    after: ["Has ProofMyAI helped you? A short quote from \"Share feedback\" in your dashboard means a lot to us."],
  });
}

export function foundingEndedEmail(): Mail {
  return compose("Your account is now on the Free plan", "Upgrade any time to get Growth features back.", {
    icon: "👋",
    title: "Thanks for being a founding customer",
    paragraphs: ["Your free Growth period has ended, and your account is now on the Free plan. All your projects and results are still there.", "Want the Growth features back? Pick a plan any time. Every plan comes with a 14-day free trial."],
    cta: { label: "See plans", url: `${appUrl()}/app/billing` },
  });
}

// ── Security ────────────────────────────────────────────────────────────────

/** Alerts about account security events (new sign-in, password changed, 2FA on/off). */
export function securityEmail(kind: "new_login" | "password_changed" | "2fa_on" | "2fa_off" | "recovery_used", details: [string, string][]): Mail {
  const copy = {
    new_login: { icon: "🔐", title: "New sign-in to your account", subject: "New sign-in to your ProofMyAI account", text: "Your ProofMyAI account was just signed in to from a device we haven't seen before." },
    password_changed: { icon: "🔑", title: "Your password was changed", subject: "Your ProofMyAI password was changed", text: "The password for your ProofMyAI account was just changed, and other devices were signed out." },
    "2fa_on": { icon: "🛡️", title: "Two-factor authentication is on", subject: "Two-factor authentication turned on", text: "Two-factor authentication was turned on for your ProofMyAI account. Keep your recovery codes somewhere safe." },
    "2fa_off": { icon: "⚠️", title: "Two-factor authentication was turned off", subject: "Two-factor authentication turned off", text: "Two-factor authentication was turned off for your ProofMyAI account." },
    recovery_used: { icon: "🧯", title: "A recovery code was used", subject: "A recovery code was used to sign in", text: "Someone signed in to your ProofMyAI account with one of your two-factor recovery codes." },
  }[kind];
  return compose(copy.subject, copy.text, {
    icon: copy.icon,
    badge: { text: "SECURITY", color: "#b42335", bg: "#fde8eb" },
    title: copy.title,
    paragraphs: [copy.text],
    facts: details,
    cta: { label: "Review account security", url: `${appUrl()}/app/account` },
    after: ["Was this you? Then you don't need to do anything.", `Not you? Reset your password now at ${appUrl()}/forgot-password and contact ${SUPPORT_EMAIL}.`],
  }, "You're receiving this security notice because it concerns your ProofMyAI account.");
}
