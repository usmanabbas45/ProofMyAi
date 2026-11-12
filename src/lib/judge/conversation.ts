import { tokenize } from "../text";
import { safetyFindings, type SafetyFlag } from "./safety";
import { promiseIn } from "../promises";
import type { Exchange, Severity } from "./types";

/**
 * Conversation-level checks that grading a single answer against help docs misses:
 * asking again for details the customer already gave, restarting mid-conversation,
 * generic fallback replies and replies that contradict an earlier bot message.
 * Deterministic, so they also work with AI checking switched off.
 */
export type ConvFlag = "re_ask" | "restart" | "fallback" | "contradiction" | "confident_wrong" | "promise" | SafetyFlag;

/** Safety and security flags (shown with a shield, grouped in their own filter). */
export const SAFETY_FLAGS: ConvFlag[] = ["injection", "attack_blocked", "prompt_leak", "data_leak", "toxic", "wrong_language", "no_ai_disclosure", "account_change"];
/**
 * Flags that don't decide the fix on their own: an attack the bot refused (not a mistake), and
 * "stated as fact", which describes how a wrong answer was said (its article still needs fixing).
 */
export const INFO_FLAGS: ConvFlag[] = ["attack_blocked", "confident_wrong", "promise"];

export const FLAG_LABELS: Record<ConvFlag, string> = {
  re_ask: "Asked again",
  restart: "Restarted",
  fallback: "Fallback reply",
  contradiction: "Contradiction",
  confident_wrong: "Stated as fact",
  promise: "Promised follow-up",
  injection: "Prompt injection",
  attack_blocked: "Attack blocked",
  prompt_leak: "Prompt leaked",
  data_leak: "Data leak",
  toxic: "Rude reply",
  wrong_language: "Wrong language",
  no_ai_disclosure: "Hid being an AI",
  account_change: "Changed login details",
};

export const FLAG_SEVERITY: Record<ConvFlag, Severity> = {
  re_ask: "medium", restart: "medium", fallback: "low", contradiction: "high", confident_wrong: "high", promise: "low",
  injection: "high", attack_blocked: "none", prompt_leak: "high", data_leak: "high", toxic: "high", wrong_language: "medium", no_ai_disclosure: "high", account_change: "high",
};

interface Detail { key: string; label: string; ask: RegExp; given: RegExp }

// What the bot might ask for, and how to recognise that the customer already gave it (masked tokens included).
const DETAILS: Detail[] = [
  { key: "reg", label: "vehicle registration", ask: /\b(registration|reg(?:istration)? (?:number|plate)|number plate|licen[cs]e plate|\breg\b)/i, given: /\[reg\]|\b[A-Z]{2}\d{2} ?[A-Z]{3}\b/i },
  { key: "postcode", label: "postcode", ask: /\b(post ?code|zip ?code)\b/i, given: /\[postcode\]|\b[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2}\b/i },
  { key: "email", label: "email address", ask: /\be-?mail\b/i, given: /\[email\]|[\w.+-]+@[\w-]+\.[\w.]+/ },
  { key: "phone", label: "phone number", ask: /\b(phone|mobile|contact|telephone) number\b/i, given: /\[phone\]|(?:\+|00)?\d[\d\s-]{8,}\d/ },
  { key: "order", label: "order number", ask: /\border (?:number|no\.?|id|#)|\breference number\b/i, given: /\border\s*(?:number|no\.?|id|#)?\s*[:#]?\s*[A-Z0-9-]*\d{4,}|#\d{4,}|\bref(?:erence)?\s*[:#]?\s*[A-Z0-9-]*\d{3,}/i },
  { key: "name", label: "name", ask: /\b(your (?:full )?name|who am i speaking)\b/i, given: /\[name\]|\bmy name(?:'s| is)\b/i },
];

const ASKING = /\?|\b(please (?:provide|send|share|confirm|tell|enter|give)|could you|can you (?:provide|send|share|confirm|tell|give)|may i (?:have|take|get)|what(?:'s| is) your|let me know your)\b/i;
const GREETING = /^\s*(?:hi|hello|hey|welcome|good (?:morning|afternoon|evening))\b[^.!?]*[.!?,]?\s*(?:[^.!?]*\b(?:how (?:can|may) i (?:help|assist)|what can i (?:do|help)))|\bhow (?:can|may) i (?:help|assist) you today\b|\bwelcome to\b/i;
const FALLBACK = /\b(?:i(?:'m| am) (?:sorry, )?(?:not sure i understand|unable to (?:help|answer|understand))|i (?:did not|didn't|don't|do not) understand|(?:a member of )?(?:our|the) team will (?:get back|respond|reply|be in touch)|we(?:'ll| will) (?:get back to you|respond shortly|be in touch shortly)|someone will (?:get back|respond|be in touch)|please (?:contact|call|email) (?:us|our (?:support|team))|i can(?:'t|not) help with that|could you rephrase)\b/i;
const NEGATION = /\b(?:do not|don't|dont|never|cannot|can't|cant|won't|will not|must not|mustn't|should not|shouldn't|not able to|no longer)\s+([a-z][a-z' -]{2,60})/gi;
const NEG_WORD = /\b(?:not|never|no|don't|dont|can't|cant|cannot|won't|mustn't|shouldn't|isn't|aren't|without)\b/i;

const userText = (e: Exchange) => [...(e.context ?? []).filter((t) => t.role === "user").map((t) => t.content), e.question].join("\n");
const botTurns = (e: Exchange) => (e.context ?? []).filter((t) => t.role === "assistant").map((t) => t.content);

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter(Boolean);
}

function containsSeq(hay: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

export interface ConvFinding { flag: ConvFlag; reason: string }

const SAFETY_SET = new Set<ConvFlag>(SAFETY_FLAGS);
export const isSafetyFlag = (f: string) => SAFETY_SET.has(f as ConvFlag);

export function conversationFindings(e: Exchange): ConvFinding[] {
  const out: ConvFinding[] = [];
  const answer = e.answer;
  const earlierBot = botTurns(e);

  // 1. Re-asking for a detail the customer already gave.
  if (ASKING.test(answer)) {
    const given = userText(e);
    for (const d of DETAILS) {
      if (d.ask.test(answer) && d.given.test(given)) {
        out.push({ flag: "re_ask", reason: `Asked again for the customer's ${d.label}, which they had already given.` });
        break;
      }
    }
  }

  // 2. Greeting / "how can I help" as if the conversation had just started.
  if (earlierBot.length > 0 && GREETING.test(answer)) {
    out.push({ flag: "restart", reason: "Greeted the customer as if the conversation had just started, losing the context." });
  }

  // 3. Generic fallback instead of an answer.
  if (FALLBACK.test(answer)) {
    out.push({ flag: "fallback", reason: "Gave a generic fallback reply instead of answering." });
  }

  // 4. Saying something an earlier bot reply ruled out ("don't drive the car" → "drive the car in").
  const phrases: { text: string; tokens: string[] }[] = [];
  for (const prev of earlierBot) {
    for (const m of prev.matchAll(NEGATION)) {
      const tokens = tokenize(m[1].split(/[.,;!?]/)[0]).slice(0, 3);
      if (tokens.length >= 2) phrases.push({ text: m[1].split(/[.,;!?]/)[0].trim(), tokens });
    }
  }
  if (phrases.length) {
    for (const s of sentences(answer)) {
      if (NEG_WORD.test(s)) continue;
      const toks = tokenize(s);
      const hit = phrases.find((p) => containsSeq(toks, p.tokens));
      if (hit) {
        out.push({ flag: "contradiction", reason: `May contradict an earlier bot reply that said not to "${hit.text}".` });
        break;
      }
    }
  }
  // 5. A promise of later work ("I'll check and get back to you"): tracked on live chats until a task exists.
  const promise = promiseIn(answer);
  if (promise) out.push({ flag: "promise", reason: `Promised a follow-up ("${promise.slice(0, 120)}"). Make sure a task or ticket exists for it.` });
  // 6. Safety and security.
  out.push(...safetyFindings(e));
  return out;
}
