import { buildKbIndex } from "./judge/features";
import { heuristicGrade } from "./judge/heuristic";
import { llmAvailable, llmGradeConversation } from "./judge/llm";
import { certaintySeverity, statedAsFact } from "./judge/certainty";
import { conversationFindings, FLAG_LABELS, INFO_FLAGS } from "./judge/conversation";
import { VERDICT_LABELS, type Exchange, type Grade, type KbDoc, type Severity, type Verdict } from "./judge/types";
import { rateLimit } from "./security";

/**
 * The public "AI chatbot answer checker": grades one customer question + bot answer against the
 * policy text the visitor pastes. Nothing is stored. Uses the AI judge when one is configured
 * (with a daily cap so the free tool can't run up costs), otherwise the rule-based judge.
 */

export const FREE_CHECK_LIMITS = { question: 1000, answer: 3000, policy: 8000 };
const DAILY_AI_CHECKS = Number(process.env.FREE_TOOL_DAILY_AI) || 300;

export interface FreeCheckResult {
  verdict: Verdict;
  label: string;
  severity: Severity;
  reason: string;
  mode: "ai" | "basic";
  flags: string[];
}

export async function freeCheck(question: string, answer: string, policy: string): Promise<FreeCheckResult> {
  const ex: Exchange = { conversationId: "free-tool", turnIndex: 0, question: question.slice(0, FREE_CHECK_LIMITS.question), answer: answer.slice(0, FREE_CHECK_LIMITS.answer) };
  const docs: KbDoc[] = policy.trim() ? [{ title: "Your policy", content: policy.slice(0, FREE_CHECK_LIMITS.policy) }] : [];
  let grade: Grade | null = null;
  let mode: FreeCheckResult["mode"] = "basic";
  if (llmAvailable() && rateLimit("free-tool-ai-daily", DAILY_AI_CHECKS, 86400000)) {
    try {
      [grade] = await llmGradeConversation([ex], docs, { projectId: null, kind: "tool" });
      mode = "ai";
    } catch (err) {
      console.error("[free-tool] AI judge failed, using basic checks:", err instanceof Error ? err.message : err);
    }
  }
  grade ??= heuristicGrade(ex, buildKbIndex(docs));
  const flags = conversationFindings(ex).filter((f) => !INFO_FLAGS.includes(f.flag)).map((f) => `${FLAG_LABELS[f.flag]}: ${f.reason}`);
  const fact = statedAsFact(ex.answer, grade.verdict);
  if (fact) {
    grade = { ...grade, severity: certaintySeverity(grade.severity, fact) };
    flags.push(`${FLAG_LABELS.confident_wrong}: ${fact.reason.replace(/your docs don't/, "your policy doesn't")}`);
  }
  // The rule-based reasons talk about a "knowledge base"; here the visitor pasted a policy.
  const reason = grade.reason.replace(/your knowledge base|the knowledge base/gi, "your policy").replace(/knowledge base/gi, "policy");
  return { verdict: grade.verdict, label: VERDICT_LABELS[grade.verdict], severity: grade.severity, reason, mode, flags };
}
