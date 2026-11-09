import { contentSet, coverage, extractNumbers, tokenize } from "../text";
import type { Exchange, KbDoc, Verdict } from "./types";
import { VERDICTS } from "./types";

// Always needs a human: legal threats, fraud/security, safety, or an explicit request for a person.
const STRONG_ESCALATION =
  /\b(lawyer|legal action|sue|suing|chargeback|fraud|scam|hacked|stolen|injur\w*|allergic reaction|medical emergency|emergency|furious|unacceptable|(speak|talk) (to|with) (a |an )?(human|person|manager|agent|someone|real)|(get|give) me (a |an )?(human|person|manager|agent)|charged (twice|two times|double)|double[- ]charged|without my (permission|consent|knowledge)|didn'?t authori[sz]e|unauthori[sz]ed|swallow\w*|burn(ed|t|s)? (my|his|her|their)|poison\w*|bleeding|choking|unconscious)\b/i;
// Needs a human only if the docs cannot answer it (e.g. a refund *policy* question is fine for a bot).
const SOFT_ESCALATION = /\b(refund|cancel\w*|complain\w*|complaint|angry|broken|damaged|urgent|manager|human)\b/i;
export const ESCALATION_ACTIONS =
  /\b(connect(ing)? you|transfer|escalat|human|team member|support team|agent will|someone will|contact (our|the) (team|support)|open(ed)? a ticket|reach out)/i;
export const HEDGES = /\b(i think|probably|maybe|might|not sure|i believe|possibly|perhaps|as far as i know)\b/i;
const OVERPROMISE = /\b(guarantee[ds]?|100%|always|never fail|definitely|promise|free of charge|no questions asked|lifetime)\b/i;
const REFUSAL = /\b(i (can't|cannot|am unable to|don't have)|unable to help|not able to)\b/i;

export interface KbIndex {
  docs: KbDoc[];
  sets: Set<string>[];
  all: Set<string>;
  numbers: Set<string>;
}

export function buildKbIndex(docs: KbDoc[]): KbIndex {
  const sets = docs.map((d) => contentSet(`${d.title}\n${d.content}`));
  const all = new Set<string>();
  sets.forEach((s) => s.forEach((w) => all.add(w)));
  const numbers = new Set(docs.flatMap((d) => extractNumbers(d.content)));
  return { docs, sets, all, numbers };
}

export function bestDoc(index: KbIndex, text: string): { title: string | null; score: number } {
  let best = { title: null as string | null, score: 0 };
  index.sets.forEach((set, i) => {
    const s = coverage(text, set);
    if (s > best.score) best = { title: index.docs[i].title, score: s };
  });
  return best;
}

/** Signals describing one exchange. Shared by the rule-based judge and the neural risk model. */
export interface ExchangeSignals {
  grounding: number; // share of answer words found in the knowledge base
  bestDocGrounding: number; // share found in the single best-matching doc
  questionCoverage: number; // share of question words the KB knows about
  unknownNumberRatio: number; // share of numbers in the answer that the KB never mentions
  answerLength: number; // words in answer
  hedging: boolean;
  overpromise: boolean;
  refusal: boolean;
  escalationNeeded: boolean;
  escalated: boolean;
}

export function signalsFor(ex: Exchange, index: KbIndex): ExchangeSignals {
  const nums = extractNumbers(ex.answer);
  const unknownNums = nums.filter((n) => !index.numbers.has(n) && !extractNumbers(ex.question).includes(n));
  return {
    grounding: index.docs.length ? coverage(ex.answer, index.all) : 0,
    bestDocGrounding: index.docs.length ? bestDoc(index, ex.answer).score : 0,
    questionCoverage: index.docs.length ? coverage(ex.question, index.all) : 0,
    unknownNumberRatio: nums.length ? unknownNums.length / nums.length : 0,
    answerLength: tokenize(ex.answer).length,
    hedging: HEDGES.test(ex.answer),
    overpromise: OVERPROMISE.test(ex.answer),
    refusal: REFUSAL.test(ex.answer),
    escalationNeeded:
      STRONG_ESCALATION.test(ex.question) ||
      (SOFT_ESCALATION.test(ex.question) && (index.docs.length === 0 || coverage(ex.question, index.all) < 0.5)),
    escalated: ESCALATION_ACTIONS.test(ex.answer),
  };
}

export const FEATURE_NAMES = [
  "grounding",
  "best_doc_grounding",
  "question_coverage",
  "unknown_number_ratio",
  "log_answer_length",
  "hedging",
  "overpromise",
  "refusal",
  "escalation_needed",
  "escalated",
  "escalation_missed",
  "judge_confidence",
  ...VERDICTS.map((v) => `judge_${v}`),
] as const;

/** Numeric feature vector (all values roughly in 0..1) fed to the neural risk model. */
export function featureVector(s: ExchangeSignals, verdict: Verdict, confidence: number): number[] {
  const b = (x: boolean) => (x ? 1 : 0);
  return [
    s.grounding,
    s.bestDocGrounding,
    s.questionCoverage,
    s.unknownNumberRatio,
    Math.min(1, Math.log1p(s.answerLength) / Math.log(400)),
    b(s.hedging),
    b(s.overpromise),
    b(s.refusal),
    b(s.escalationNeeded),
    b(s.escalated),
    b(s.escalationNeeded && !s.escalated),
    confidence,
    ...VERDICTS.map((v) => (v === verdict ? 1 : 0)),
  ];
}
