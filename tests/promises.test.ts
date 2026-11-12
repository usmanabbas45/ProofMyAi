import { beforeEach, describe, expect, it } from "vitest";
import { processLiveChat } from "@/lib/audit/live";
import { all, get } from "@/lib/db";
import { conversationFindings } from "@/lib/judge/conversation";
import { overduePromises, promiseIn, promiseStats, recordFollowUp } from "@/lib/promises";
import type { Project } from "@/lib/projects";
import { freshDb } from "./helpers";

let projectId: number;
let project: Project;
beforeEach(() => {
  ({ projectId } = freshDb());
  project = get<Project>("SELECT * FROM projects WHERE id = ?", projectId)!;
});

const say = async (conversation_id: string, question: string, answer?: string, extra: Record<string, string> = {}) =>
  (await (await processLiveChat(project, { conversation_id, question, ...(answer ? { answer } : {}), ...extra }, { wait: true })).grades);
const promises = () => all<{ conversation_id: string; status: string; task_ref: string | null }>("SELECT conversation_id, status, task_ref FROM promises ORDER BY id");
const incidents = (code: string) => all<{ title: string; detail: string; severity: string }>("SELECT title, detail, severity FROM incidents WHERE code = ?", code);

describe("promised follow-ups", () => {
  it("recognises promises of later work, not polite offers", () => {
    expect(promiseIn("I'll check with the warehouse and get back to you today.")).toBe("I'll check with the warehouse and get back to you today.");
    expect(promiseIn("Thanks! Someone from our team will call you tomorrow.")).not.toBeNull();
    expect(promiseIn("Let me look into that and email you the details.")).not.toBeNull();
    expect(promiseIn("You'll receive a confirmation email within the hour.")).not.toBeNull();
    expect(promiseIn("Let me know if there's anything else.")).toBeNull();
    expect(promiseIn("Delivery takes 3-5 days and costs £3.99.")).toBeNull();
    expect(promiseIn("I can help you with that here.")).toBeNull();
  });

  it("marks the answer with a 'Promised follow-up' badge without counting it as a mistake", () => {
    const f = conversationFindings({ conversationId: "c", turnIndex: 0, question: "Where's my order?", answer: "I'll check and get back to you." });
    expect(f.map((x) => x.flag)).toContain("promise");
  });

  it("a task id on the reply keeps the promise; a later bot reply keeps it too", async () => {
    await say("a", "Is my order delayed?", "I'll check with the warehouse and get back to you.", { task_id: "odoo-1" });
    await say("b", "Can I change my address?", "Let me check and get back to you shortly.");
    expect(promises()).toEqual([{ conversation_id: "a", status: "tasked", task_ref: "odoo-1" }, { conversation_id: "b", status: "open", task_ref: null }]);
    await say("b", "Thanks", "Good news: your address has been changed.");
    expect(promises()[1].status).toBe("kept");
  });

  it("a follow-up reported later (n8n created the task) keeps it", async () => {
    await say("c", "Refund?", "Our team will contact you about the refund.");
    expect(recordFollowUp(projectId, "c", "ticket-9")).toBe(1);
    expect(promises()[0]).toMatchObject({ status: "tasked", task_ref: "ticket-9" });
  });

  it("alerts once when promises are overdue, and straight away when a customer chases one", async () => {
    await say("d", "Where's my parcel?", "I'll look into it and get back to you.");
    await say("e", "Can I get an invoice?", "We'll email you the invoice today.");
    expect(await overduePromises(projectId, new Date(Date.now() + 2 * 86400000))).toBe(2);
    expect(incidents("PROMISE_NOT_KEPT")[0].title).toBe("2 promised follow-ups weren't done");
    expect(await overduePromises(projectId, new Date(Date.now() + 3 * 86400000))).toBe(0);

    await say("f", "Has my refund gone through?", "Let me check and get back to you.");
    await say("f", "Any update? I still haven't heard anything.");
    expect(incidents("PROMISE_CHASED")[0]).toMatchObject({ severity: "high", title: "A customer is chasing a follow-up the bot promised" });
    expect(incidents("PROMISE_CHASED")[0].detail).toContain("Any update?");
    expect(promiseStats(projectId)).toMatchObject({ made: 3, broken: 3, kept: 0 });
  });

  it("doesn't track one-off pre-send checks", async () => {
    await (await processLiveChat(project, { conversation_id: "check:1", question: "q", answer: "I'll get back to you." }, { wait: true, trackPromises: false })).grades;
    expect(promises()).toEqual([]);
  });
});
