import { extractNumbers } from "../text";
import { HEDGES } from "./features";
import type { Severity, Verdict } from "./types";

/**
 * "Confidently wrong": a wrong answer the bot stated as plain fact. Customers act on an answer that
 * sounds sure of itself without double-checking, so it is more dangerous than the same mistake said
 * with a hedge ("I think…", "you may want to check…"), which at least invites a second look.
 * Deterministic, so it works the same with the AI judge or the rule-based judge.
 */

const WRONG: Verdict[] = ["hallucination", "unsupported"];
// Absolute words and phrases that tell the customer there is nothing to double-check.
const CERTAIN = /\b(definitely|absolutely|certainly|of course|guaranteed?|100%|always|never|for sure|no problem|rest assured|without (a )?doubt|all (items|orders|products|customers)|every (item|order|product|customer)|any (item|order|product))\b/i;
// A direct yes/no opener ("Yes, …", "No, …", "Sure! …").
const DIRECT = /^\s*(?:yes|yep|yeah|no|nope|sure|of course|absolutely|definitely|correct)\b[\s,.!:-]/i;
// Concrete claims the customer will act on: prices, durations, percentages, codes, dates.
const CONCRETE = /[£$€]\s?\d|\b\d+(?:[.,]\d+)?\s?(?:%|percent|days?|hours?|weeks?|months?|years?|business days?|working days?|minutes?)\b|\bcode\s+[A-Z0-9]{3,}\b/i;
// Phrases that send the customer to check, which soften a mistake.
const DEFERS = /\b(please (check|confirm|verify)|double[- ]check|check (with|our)|contact (us|our|the)|I('m| am) not (sure|certain)|it depends|may vary|subject to)\b/i;

export interface CertaintyFinding { reason: string; markers: string[]; absolute: boolean }

/** Returns a finding when a wrong answer was stated as plain fact, or null. */
export function statedAsFact(answer: string, verdict: Verdict): CertaintyFinding | null {
  if (!WRONG.includes(verdict)) return null;
  if (HEDGES.test(answer) || DEFERS.test(answer)) return null;
  const markers: string[] = [];
  const certain = answer.match(CERTAIN);
  if (certain) markers.push(`"${certain[0]}"`);
  if (DIRECT.test(answer)) markers.push(`a direct "${answer.trim().split(/[\s,.!:]/)[0]}"`);
  const concrete = answer.match(CONCRETE);
  if (concrete) markers.push(`a specific "${concrete[0].trim()}"`);
  else if (extractNumbers(answer).length && !markers.length) markers.push("specific numbers");
  if (!markers.length) return null;
  return {
    markers,
    absolute: Boolean(certain) || DIRECT.test(answer),
    reason: `Stated as fact (${markers.join(", ")}), with no hedge, although your docs don't back it up. Customers act on a confident answer without double-checking, so it does more damage than an unsure one.`,
  };
}

/**
 * A wrong answer stated as fact is at least medium risk. One stated in absolute terms ("Yes, all items…",
 * "definitely") goes up a level, because it shuts down any doubt the customer had.
 */
export function certaintySeverity(severity: Severity, f: CertaintyFinding): Severity {
  const order: Severity[] = ["none", "low", "medium", "high"];
  const i = Math.max(order.indexOf(severity) + (f.absolute ? 1 : 0), 2);
  return order[Math.min(i, 3)];
}
