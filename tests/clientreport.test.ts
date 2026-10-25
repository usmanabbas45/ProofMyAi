import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, run } from "@/lib/db";
import { clientReportEmail, clientReportSettings, isDue, nextSendAt, parseRecipients, reportPeriod, saveClientReport, sendDueClientReports, slotStart } from "@/lib/clientreport";
import { reportFor } from "@/lib/valuereport";
import { freshDb } from "./helpers";

let projectId: number;
beforeEach(() => ({ projectId } = freshDb()));
afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; });

describe("client report settings", () => {
  it("validates recipients", () => {
    expect(parseRecipients("Owner@Client.com, ops@client.com; owner@client.com")).toEqual({ ok: true, emails: ["owner@client.com", "ops@client.com"] });
    expect(parseRecipients("")).toMatchObject({ ok: false });
    expect(parseRecipients("not-an-email")).toMatchObject({ ok: false, error: expect.stringContaining("isn't a valid email") });
    expect(parseRecipients("a@x.co,b@x.co,c@x.co,d@x.co,e@x.co,f@x.co")).toMatchObject({ ok: false });
  });

  it("saves and reads back", () => {
    saveClientReport(projectId, ["a@x.co"], "monthly", new Date("2026-10-24T12:00:00Z"));
    expect(clientReportSettings(projectId)).toEqual({ emails: ["a@x.co"], freq: "monthly", lastAt: "2026-10-24T12:00:00.000Z" });
  });
});

describe("when reports go out", () => {
  it("weekly: Monday 06:00 UTC, once per week, not straight after saving", () => {
    const sat = new Date("2026-10-24T12:00:00Z");
    expect(slotStart("weekly", sat).toISOString()).toBe("2026-10-19T06:00:00.000Z");
    expect(isDue("weekly", sat.toISOString(), sat)).toBe(false); // saved on Saturday
    const mon = new Date("2026-10-26T06:15:00Z");
    expect(isDue("weekly", sat.toISOString(), mon)).toBe(true);
    expect(isDue("weekly", mon.toISOString(), new Date("2026-10-26T06:30:00Z"))).toBe(false); // already sent
    expect(isDue("weekly", sat.toISOString(), new Date("2026-10-26T05:59:00Z"))).toBe(false); // too early
  });

  it("monthly: the 1st at 06:00 UTC, covering the month before", () => {
    const saved = new Date("2026-10-24T12:00:00Z");
    expect(isDue("monthly", saved.toISOString(), new Date("2026-10-31T23:00:00Z"))).toBe(false);
    const first = new Date("2026-11-01T06:15:00Z");
    expect(isDue("monthly", saved.toISOString(), first)).toBe(true);
    const per = reportPeriod("monthly", first);
    expect(per.month).toBe("2026-10");
    expect(per.period.label).toBe("October 2026");
    expect(reportPeriod("weekly", first).period.label).toBe("Last 7 days");
    expect(nextSendAt("monthly", saved.toISOString(), saved).toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(nextSendAt("weekly", saved.toISOString(), saved).toISOString()).toBe("2026-10-26T06:00:00.000Z");
  });
});

describe("the email", () => {
  it("is branded with the agency, lists only real highlights, links to the report", () => {
    run("INSERT INTO presend_checks (project_id, decision, verdict, created_at) VALUES (?, 'block', 'hallucination', ?)", projectId, new Date(Date.now() - 86400000).toISOString());
    const r = reportFor(projectId, reportPeriod("weekly", new Date()));
    const m = clientReportEmail(r, { brand: "Codnex", project: "Acme Shop", link: "https://proofmyai.com/v/abc", freq: "weekly" });
    expect(m.subject).toBe("Your AI & automation report · this week · Acme Shop");
    expect(m.text).toContain("1 wrong reply stopped before reaching a customer");
    expect(m.text).toContain("https://proofmyai.com/v/abc");
    expect(m.text).toContain("Prepared by Codnex");
    expect(m.html).toContain("Codnex");
    expect(m.html).not.toContain('alt="ProofMyAI"');
  });

  it("says plainly when nothing was checked (a connection may have stopped)", () => {
    const r = reportFor(projectId, reportPeriod("weekly", new Date()));
    expect(clientReportEmail(r, { brand: "ProofMyAI", project: "P", link: "x", freq: "weekly" }).text).toContain("a connection may have stopped sending data");
  });
});

describe("sending", () => {
  it("emails every recipient once per slot, from the agency, with replies to the owner", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const calls: { to: string[]; from: string; reply_to: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }));
    run("UPDATE projects SET report_brand = 'Codnex' WHERE id = ?", projectId);
    saveClientReport(projectId, ["a@client.co", "b@client.co"], "weekly", new Date("2026-10-24T12:00:00Z"));
    const mon = new Date("2026-10-26T06:15:00Z");
    expect(await sendDueClientReports(mon)).toBe(2);
    expect(calls.map((c) => c.to[0])).toEqual(["a@client.co", "b@client.co"]);
    expect(calls[0].from).toContain("Codnex");
    const owner = get<{ email: string }>("SELECT u.email FROM users u JOIN projects p ON p.user_id = u.id WHERE p.id = ?", projectId)!.email;
    expect(calls[0].reply_to).toBe(owner);
    expect(await sendDueClientReports(new Date("2026-10-26T06:30:00Z"))).toBe(0); // not twice
    expect(get("SELECT value_share_token IS NOT NULL AS t FROM projects WHERE id = ?", projectId)).toEqual({ t: 1 });
  });

  it("never sends for demo projects or when turned off", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    saveClientReport(projectId, ["a@client.co"], null);
    expect(await sendDueClientReports(new Date("2026-10-26T06:15:00Z"))).toBe(0);
    saveClientReport(projectId, ["a@client.co"], "weekly", new Date("2026-10-24T12:00:00Z"));
    run("UPDATE projects SET is_demo = 1 WHERE id = ?", projectId);
    expect(await sendDueClientReports(new Date("2026-10-26T06:15:00Z"))).toBe(0);
  });
});
