import { randomUUID } from "node:crypto";
import { z } from "zod";
import { json, readIngest } from "@/lib/api";
import { run } from "@/lib/db";
import { processLiveChat } from "@/lib/audit/live";
import { limitError, projectOwner } from "@/lib/billing";
import { DIAGNOSIS_TEXT } from "@/lib/judge/evidence";
import { VERDICT_LABELS } from "@/lib/judge/types";
import { topicFor } from "@/lib/topics";
import { areaAutonomy, decisionFor } from "@/lib/trust";

const CheckSchema = z.object({
  question: z.string().min(1).max(20000),
  answer: z.string().min(1).max(20000),
  conversation_id: z.string().min(1).max(200).optional(),
  bot_name: z.string().max(100).optional(),
  retrieved: z.array(z.string().max(20000)).max(50).optional(),
  trace_id: z.string().min(1).max(200).optional(),
});

/**
 * Pre-send check (guardrail). Call it with the customer's question and the reply your AI is about to send, before
 * sending it or acting on it. Returns allow, review or block with the reason. The answer is also monitored as usual.
 */
export async function POST(req: Request) {
  const r = await readIngest(req);
  if (r instanceof Response) return r;
  const parsed = CheckSchema.safeParse(r.body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, 400);
  }
  const over = limitError(projectOwner(r.project.id), "conversations");
  if (over) return json({ error: over }, 402);
  const { question, answer, bot_name, retrieved, trace_id } = parsed.data;
  // A fresh id per check unless the caller groups a conversation, so the same reply is always checked.
  const conversation_id = `${parsed.data.conversation_id ?? "check"}:${randomUUID().slice(0, 8)}`;
  const result = await processLiveChat(r.project, { conversation_id, bot_name, question, answer, retrieved, trace_id }, { wait: true });
  const [g] = await result.grades;
  if (!g) return json({ error: "Could not check this answer" }, 500);
  const area = g.topic || topicFor(question, g.sourceDoc);
  const autonomy = areaAutonomy(r.project.id, area);
  const decision = decisionFor(g.verdict, g.severity, autonomy);
  run("INSERT INTO presend_checks (project_id, decision, verdict, created_at) VALUES (?, ?, ?, ?)", r.project.id, decision, g.verdict, new Date().toISOString());
  return json({
    decision,
    verdict: g.verdict, label: VERDICT_LABELS[g.verdict], severity: g.severity, reason: g.reason,
    source: g.sourceDoc, evidence: g.evidence ?? null, ...(g.diagnosis ? { diagnosis: g.diagnosis, diagnosis_detail: DIAGNOSIS_TEXT[g.diagnosis].text } : {}), area, area_autonomy: autonomy,
    advice: decision === "allow" ? "Safe to send." : decision === "review" ? "Hold this reply for a person to approve, or send a safe fallback." : "Do not send. Hand the customer to a person.",
  }, 200);
}
