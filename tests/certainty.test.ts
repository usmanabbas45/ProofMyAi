import { describe, expect, it } from "vitest";
import { withCertaintyCheck } from "@/lib/audit/run";
import { certaintySeverity, statedAsFact } from "@/lib/judge/certainty";
import type { Exchange, Grade } from "@/lib/judge/types";

const ex = (answer: string): Exchange => ({ conversationId: "c", turnIndex: 0, question: "q", answer });
const grade = (verdict: Grade["verdict"], severity: Grade["severity"]): Grade => ({ turnIndex: 0, verdict, severity, confidence: 0.8, reason: "Not in the docs.", sourceDoc: null });

describe("stated as fact (confidently wrong)", () => {
  it("flags wrong answers said with certainty, a direct yes/no or specific facts", () => {
    expect(statedAsFact("Yes, all items including sale items get a full refund within 30 days.", "hallucination")).toMatchObject({ absolute: true });
    expect(statedAsFact("Refunds take 24 hours.", "hallucination")).toMatchObject({ absolute: false, markers: ['a specific "24 hours"'] });
    expect(statedAsFact("Students get 15% off with code STUDENT15.", "hallucination")).not.toBeNull();
    expect(statedAsFact("We definitely price match Amazon.", "unsupported")?.reason).toContain('"definitely"');
  });

  it("leaves hedged answers, answers that defer and vague answers alone", () => {
    expect(statedAsFact("I think refunds take 24 hours.", "hallucination")).toBeNull();
    expect(statedAsFact("Refunds take about 24 hours, but please check your order page.", "hallucination")).toBeNull();
    expect(statedAsFact("It depends on the item.", "unsupported")).toBeNull();
    expect(statedAsFact("We have lots of options for that.", "unsupported")).toBeNull();
  });

  it("only applies to wrong answers", () => {
    for (const v of ["correct", "unclear", "should_escalate", "off_policy"] as const) expect(statedAsFact("Yes, definitely, within 30 days.", v)).toBeNull();
  });

  it("raises the risk: at least medium, one level up when absolute", () => {
    const abs = statedAsFact("Yes, always.", "unsupported")!;
    const plain = statedAsFact("Delivery takes 3 days.", "unsupported")!;
    expect(certaintySeverity("medium", abs)).toBe("high");
    expect(certaintySeverity("low", abs)).toBe("medium");
    expect(certaintySeverity("medium", plain)).toBe("medium");
    expect(certaintySeverity("low", plain)).toBe("medium");
    expect(certaintySeverity("high", abs)).toBe("high");
  });

  it("adds the flag and the reason to a graded answer", () => {
    const out = withCertaintyCheck(ex("Yes, we ship across Europe in 5-7 days."), grade("unsupported", "medium"), ["re_ask"]);
    expect(out.flags).toEqual(["re_ask", "confident_wrong"]);
    expect(out.grade.severity).toBe("high");
    expect(out.grade.reason).toMatch(/^Not in the docs\. Stated as fact/);
    const untouched = withCertaintyCheck(ex("I believe we might ship there."), grade("unsupported", "medium"), []);
    expect(untouched).toEqual({ grade: grade("unsupported", "medium"), flags: [] });
  });
});
