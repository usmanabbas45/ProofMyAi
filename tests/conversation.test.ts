import { beforeEach, describe, expect, it } from "vitest";
import { alertMissingReplies, LiveChatSchema, liveMetrics, processLiveChat, unansweredMessages } from "@/lib/audit/live";
import { fixList, riskSummary } from "@/lib/audit/run";
import { conversationIdFor, pollChatSource, type ChatSource } from "@/lib/connectors/twilio";
import { all, get, run } from "@/lib/db";
import { conversationFindings } from "@/lib/judge/conversation";
import { exchangesOf, type Exchange } from "@/lib/judge/types";
import { applyRules } from "@/lib/rules";
import { encrypt } from "@/lib/security";
import { freshDb } from "./helpers";

let projectId: number;
const project = () => get<{ id: number; redact_pii: number; mask_terms: string | null }>("SELECT id, redact_pii, mask_terms FROM projects WHERE id = ?", projectId)!;
const flags = (turns: [string, string][]) => {
  const ex = exchangesOf({ id: "c", turns: turns.map(([role, content]) => ({ role: role as "user" | "assistant", content })) });
  return conversationFindings(ex[ex.length - 1]).map((f) => f.flag);
};

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  ({ projectId } = freshDb());
});

describe("conversation checks", () => {
  it("catches asking again for details already given (also when masked)", () => {
    expect(flags([["user", "My car AB12 CDE won't start"], ["assistant", "What is your registration number?"]])).toEqual(["re_ask"]);
    expect(flags([["user", "I'm at [postcode]"], ["assistant", "Sorry, please provide your postcode."]])).toEqual(["re_ask"]);
    expect(flags([["user", "Hi"], ["assistant", "What is your registration number?"]])).toEqual([]);
    expect(flags([["user", "Car AB12 CDE"], ["assistant", "Thanks, I've noted your registration."]])).toEqual([]);
  });

  it("catches restarts, fallbacks and contradictions", () => {
    expect(flags([["user", "hi"], ["assistant", "Hello! How can I help?"], ["user", "My car broke down"], ["assistant", "Hello! Welcome to AB Motors, how can I help you today?"]])).toContain("restart");
    expect(flags([["user", "hi"], ["assistant", "Hello! How can I help?"]])).toEqual([]);
    expect(flags([["user", "Is my windscreen covered?"], ["assistant", "Thanks for your message, our team will get back to you shortly."]])).toEqual(["fallback", "promise"]);
    expect(flags([["user", "Warning light on"], ["assistant", "Please don't drive the car, we'll arrange recovery."], ["user", "ok what now"], ["assistant", "You can drive the car to our garage tomorrow."]])).toEqual(["contradiction"]);
    expect(flags([["user", "Warning light on"], ["assistant", "Please don't drive the car."], ["user", "ok"], ["assistant", "Again, do not drive the car until recovery arrives."]])).toEqual([]);
  });

  it("must-include rules", () => {
    const ex: Exchange = { conversationId: "c", turnIndex: 1, question: "Is my windscreen covered?", answer: "Yes, windscreens are covered." };
    const g = { turnIndex: 1, verdict: "correct" as const, severity: "none" as const, reason: "", sourceDoc: null, confidence: 1 };
    const rules = [{ id: 1, kind: "must_include" as const, pattern: "windscreen => not covered" }];
    expect(applyRules(ex, g, rules).hit).toBe("must_include:windscreen => not covered");
    expect(applyRules({ ...ex, answer: "Windscreens are not covered, sorry." }, g, rules).hit).toBeNull();
    expect(applyRules({ ...ex, question: "Tyres?", answer: "Tyres are covered." }, g, rules).hit).toBeNull();
  });
});

describe("live tracking: flags, metrics and missing replies", () => {
  it("stores conversation flags, latency, cost and errors and shows them in the fix list and risk summary", async () => {
    const r = await processLiveChat(project(), LiveChatSchema.parse({
      conversation_id: "c1", messages: [{ role: "user", content: "My car AB12 CDE won't start" }, { role: "assistant", content: "What is your registration number?" }],
      latency_ms: 2500, cost_usd: 0.002,
    }), { wait: true });
    await r.grades;
    const item = get<{ conv_flags: string; latency_ms: number; cost_usd: number; verdict: string; question: string }>("SELECT conv_flags, latency_ms, cost_usd, verdict, question FROM audit_items")!;
    expect(item).toMatchObject({ conv_flags: "re_ask", latency_ms: 2500, cost_usd: 0.002, verdict: "unclear" });
    expect(item.question).toContain("[reg]"); // masked
    const audit = get<{ id: number }>("SELECT id FROM audits")!.id;
    expect(fixList(audit)[0].doc).toMatch(/Bot memory/);
    expect(riskSummary(audit).flags.re_ask).toBe(1);
    expect(liveMetrics(projectId)).toMatchObject({ replies: 1, conversations: 1, avgLatencyMs: 2500, fallbacks: 0, conversationProblems: 1 });
  });

  it("alerts once when the bot never replies, and clears when it does", async () => {
    const old = new Date(Date.now() - 10 * 60000).toISOString();
    await processLiveChat(project(), LiveChatSchema.parse({ conversation_id: "w1", question: "Hello? My car is stuck", error: "worker timeout" }), { receivedAt: old });
    await processLiveChat(project(), LiveChatSchema.parse({ conversation_id: "w2", question: "Anyone there?" }));
    expect(unansweredMessages(projectId).map((u) => u.conversation_id)).toEqual(["w1"]); // w2 is still within the 120s timeout
    await alertMissingReplies();
    expect(await alertMissingReplies()).toBe(0); // already alerted: no repeat alerts
    const inc = all<{ title: string; detail: string }>("SELECT title, detail FROM incidents");
    expect(inc).toHaveLength(1);
    expect(inc[0].title).toMatch(/did not reply to 1 customer message/);
    expect(inc[0].detail).toContain("worker timeout");
    await (await processLiveChat(project(), LiveChatSchema.parse({ conversation_id: "w1", question: "Hello? My car is stuck", answer: "Sorry for the wait, recovery is on the way." }), { wait: true })).grades;
    expect(unansweredMessages(projectId)).toEqual([]);
    run("UPDATE projects SET reply_timeout_sec = 0");
    await processLiveChat(project(), LiveChatSchema.parse({ conversation_id: "w3", question: "hi" }), { receivedAt: old });
    expect(unansweredMessages(projectId)).toEqual([]);
  });
});

describe("Twilio connector", () => {
  const bot = "whatsapp:+14155238886";
  const cust = "whatsapp:+447700900123";
  const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toUTCString();
  const msg = (dir: "in" | "out", body: string, minAgo: number, status = "delivered") => ({
    sid: `SM${Math.random()}`, body, from: dir === "in" ? cust : bot, to: dir === "in" ? bot : cust,
    direction: dir === "in" ? "inbound" : "outbound-reply", status, date_sent: iso(minAgo), date_created: iso(minAgo), error_code: status === "failed" ? 63016 : null,
  });
  const source = (): ChatSource => {
    const id = run("INSERT INTO chat_sources (project_id, platform, name, account_id, secret_enc, bot_address) VALUES (?, 'twilio', 'WA', ?, ?, ?)",
      projectId, `AC${"a".repeat(32)}`, encrypt(JSON.stringify({ secret: "s" })), bot).lastInsertRowid;
    return get<ChatSource>("SELECT * FROM chat_sources WHERE id = ?", id)!;
  };

  it("pairs customer messages with bot replies, measures latency, and flags unanswered ones", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
      return Response.json({
        messages: [
          msg("out", "Hello! What is your registration number?", 58),
          msg("in", "My car AB12 CDE broke down", 60),
          msg("in", "Are you there? my name is Tom Jones", 20),
          msg("out", "Other chat", 30, "delivered"),
        ].map((m, i) => (i === 3 ? { ...m, to: "whatsapp:+1999", from: "whatsapp:+1888" } : m)), // unrelated number is ignored
        next_page_uri: null,
      });
    };
    const r = await pollChatSource(source(), fetcher as never);
    expect(r).toEqual({ replies: 1, waiting: 1, error: null });
    expect(calls[0]).toContain(`/Accounts/AC${"a".repeat(32)}/Messages.json`);
    const item = get<{ conversation_id: string; question: string; latency_ms: number; conv_flags: string }>("SELECT conversation_id, question, latency_ms, conv_flags FROM audit_items")!;
    expect(item.conversation_id).toBe(conversationIdFor(cust));
    expect(item.conversation_id).not.toContain("447700");
    expect(item.question).toBe("My car [reg] broke down");
    expect(item.latency_ms).toBeGreaterThan(100000);
    expect(item.conv_flags).toContain("re_ask");
    const pending = get<{ question: string }>("SELECT question FROM pending_replies")!;
    expect(pending.question).toBe("Are you there? my name is [name]");
    expect(unansweredMessages(projectId)).toHaveLength(1);
  });

  it("reports Twilio errors and records failed deliveries", async () => {
    const src = source();
    const bad = await pollChatSource(src, (async () => Response.json({ message: "Authenticate" }, { status: 401 })) as never);
    expect(bad.error).toMatch(/rejected/);
    const r = await pollChatSource(src, (async () => Response.json({ messages: [msg("in", "help", 30), msg("out", "On it", 29, "failed")] })) as never);
    expect(r).toMatchObject({ replies: 0, waiting: 1 });
    expect(get<{ error: string }>("SELECT error FROM pending_replies")!.error).toMatch(/failed \(error 63016\)/);
  });
});
