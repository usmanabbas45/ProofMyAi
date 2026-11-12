import { z } from "zod";
import { json, readIngest } from "@/lib/api";
import { recordFollowUp } from "@/lib/promises";

const FollowUpSchema = z.object({
  conversation_id: z.string().min(1).max(200),
  bot_name: z.string().max(100).optional(),
  /** Your task, ticket or CRM activity id. */
  task_id: z.string().min(1).max(200),
  /** "created" (default): a task exists for the promise. "done": the follow-up already happened. */
  status: z.enum(["created", "done"]).default("created"),
});

/**
 * Tell ProofMyAI a promised follow-up has a task behind it, e.g. from n8n right after it creates the Odoo task or
 * helpdesk ticket. Use the same conversation_id (and bot_name) you send to /chat-events.
 */
export async function POST(req: Request) {
  const r = await readIngest(req);
  if (r instanceof Response) return r;
  const parsed = FollowUpSchema.safeParse(r.body);
  if (!parsed.success) return json({ error: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, 400);
  const { conversation_id, bot_name, task_id, status } = parsed.data;
  const key = bot_name ? `${bot_name}:${conversation_id}` : conversation_id;
  const updated = recordFollowUp(r.project.id, key, task_id, status === "done");
  return json({ promises_updated: updated, ...(updated ? {} : { note: "No open promise in this conversation (yet). If the reply arrives later, send task_id with it on /chat-events instead." }) }, 200);
}
