import { json, readIngest } from "@/lib/api";
import { limitError, projectOwner } from "@/lib/billing";
import { ingestCall, parseCall } from "@/lib/voice";

/**
 * Voice bots: send each finished call. Point a Vapi "Server URL" (end-of-call-report) or a Retell webhook
 * (call_ended) here, or POST { call_id, transcript, transferred, ended_reason }. Webhooks that can't send an
 * Authorization header may put the API key in the URL: /api/v1/calls?key=ap_live_...
 */
export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key && !req.headers.get("authorization") && !req.headers.get("x-api-key")) {
    const headers = new Headers(req.headers);
    headers.set("authorization", `Bearer ${key}`);
    req = new Request(req.url, { method: req.method, headers, body: await req.text() });
  }
  const r = await readIngest(req);
  if (r instanceof Response) return r;
  const parsed = parseCall(r.body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if ("ignored" in parsed) return json({ ignored: parsed.ignored }, 200);
  if (!parsed.call.turns.length) return json({ error: "The call has no transcript. Send messages with roles user/assistant, or a transcript like \"AI: …\\nUser: …\"." }, 400);
  const over = limitError(projectOwner(r.project.id), "conversations");
  if (over) return json({ error: over }, 402);
  const result = await ingestCall(r.project, parsed.call);
  if (result.duplicate) return json({ duplicate: true, call_id: parsed.call.id }, 200);
  return json({ call_id: parsed.call.id, provider: parsed.call.provider, answers_checked: result.graded, issues: result.issues }, 201);
}
