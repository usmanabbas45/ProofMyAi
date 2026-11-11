import { z } from "zod";
import { OutcomeCheckSchema } from "../outcome";
import { truncate } from "../text";

export const AgentStepSchema = z.object({
  type: z.enum(["llm", "tool", "retrieval", "other"]).default("other"),
  name: z.string().max(200).default(""),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().max(5000).nullish(),
  duration_ms: z.number().nonnegative().default(0),
  tokens: z.number().nonnegative().default(0),
  cost_usd: z.number().nonnegative().default(0),
});

export const AgentRunSchema = z.object({
  run_id: z.string().min(1).max(200),
  agent_name: z.string().min(1).max(200),
  goal: z.string().max(20000).default(""),
  /** "running" reports a start; send the finished run later with the same run_id. Starts that never finish are alerted. */
  status: z.enum(["success", "error", "timeout", "cancelled", "running"]).default("success"),
  final_output: z.string().max(50000).default(""),
  steps: z.array(AgentStepSchema).max(2000).default([]),
  /** Optional: where ProofMyAI can confirm the result really exists (a CRM record, an order, a file). */
  verify: OutcomeCheckSchema.optional(),
  /** Your id for one end-to-end request, shared with /chat-events, /workflow-runs, /approvals and /verify. */
  trace_id: z.string().min(1).max(200).optional(),
});

export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;

export interface Issue {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface Limits {
  costBudgetUsd: number;
  maxSteps: number;
  maxMs: number;
}

const stable = (v: unknown) => JSON.stringify(v ?? null);

/** Deterministic reliability checks that need no AI: errors, loops, runaway cost and latency, empty output. */
export function checkAgentRun(runData: AgentRun, limits: Limits): Issue[] {
  const issues: Issue[] = [];
  const steps = runData.steps;
  const totalCost = steps.reduce((s, x) => s + x.cost_usd, 0);
  const totalMs = steps.reduce((s, x) => s + x.duration_ms, 0);

  if (runData.status !== "success") {
    issues.push({ code: "RUN_FAILED", severity: "high", message: `The run ended with status "${runData.status}".` });
  }

  const failed = steps.filter((s) => s.error);
  if (failed.length > 0) {
    const names = [...new Set(failed.map((s) => s.name || s.type))].slice(0, 5).join(", ");
    issues.push({
      code: "TOOL_ERRORS",
      severity: failed.length >= 3 ? "high" : "medium",
      message: `${failed.length} step${failed.length > 1 ? "s" : ""} failed (${names}). First error: ${truncate(failed[0].error ?? "", 200)}`,
    });
  }

  // Loop detection: the same tool called with identical input 3+ times.
  const counts = new Map<string, number>();
  for (const s of steps.filter((x) => x.type === "tool")) {
    const key = `${s.name}|${stable(s.input)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const loops = [...counts].filter(([, n]) => n >= 3);
  if (loops.length > 0) {
    const [key, n] = loops.sort((a, b) => b[1] - a[1])[0];
    issues.push({ code: "LOOP_DETECTED", severity: "high", message: `The agent called "${key.split("|")[0]}" ${n} times with the same input - it is probably stuck in a loop.` });
  }

  if (steps.length > limits.maxSteps) {
    issues.push({ code: "TOO_MANY_STEPS", severity: "medium", message: `${steps.length} steps (your limit is ${limits.maxSteps}).` });
  }
  if (totalCost > limits.costBudgetUsd) {
    issues.push({ code: "OVER_BUDGET", severity: totalCost > limits.costBudgetUsd * 3 ? "high" : "medium", message: `This run cost $${totalCost.toFixed(4)} (budget $${limits.costBudgetUsd.toFixed(2)}).` });
  }
  if (totalMs > limits.maxMs) {
    issues.push({ code: "SLOW_RUN", severity: "low", message: `The run took ${(totalMs / 1000).toFixed(1)}s (limit ${(limits.maxMs / 1000).toFixed(0)}s).` });
  }
  if (runData.status === "success" && runData.final_output.trim() === "") {
    issues.push({ code: "EMPTY_OUTPUT", severity: "high", message: "The run reported success but produced no output (silent failure)." });
  }
  if (runData.status === "success" && steps.length > 0 && failed.length > 0 && steps[steps.length - 1].error) {
    issues.push({ code: "ENDED_ON_ERROR", severity: "medium", message: "The last step failed but the run still reported success." });
  }
  const destructive = destructiveIssue(steps);
  if (destructive) issues.push(destructive);
  return issues;
}

// Words in a tool's name that mean it removes or overwrites data ("delete_record", "volumeDelete", "dropTable").
const DESTRUCTIVE_WORDS = new Set(["delete", "deletes", "drop", "truncate", "destroy", "wipe", "purge", "erase", "remove", "rm", "rmdir", "terminate", "deprovision", "uninstall", "overwrite", "revoke", "unlink", "nuke", "flush"]);
// Inside a tool's input: SQL, shell and API calls that delete or overwrite data.
const DESTRUCTIVE_INPUT = [
  /\bdrop\s+(table|database|schema|collection|index)\b/i,
  /\btruncate\s+(table\s+)?\w+/i,
  /\bdelete\s+from\s+[\w."`]+(?![^;]*\bwhere\b)/i, // DELETE without WHERE: every row
  /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i,
  /\bgit\s+(push\s+(-f|--force)|reset\s+--hard|clean\s+-[a-z]*f)/i,
  /\b(dropDatabase|deleteMany|bulkDelete|flushall|flushdb)\b/,
  /\bmutation\b[\s\S]{0,300}?\b\w*(Delete|Destroy|Drop|Purge|Wipe)\b/,
  /"method"\s*:\s*"DELETE"|\bmethod\s*[:=]\s*['"]?DELETE\b/,
];
// Signs the action hit live data or everything at once, matched on words so "vol_prod" and "volumeDelete" count.
const BLAST = new Set(["prod", "production", "live", "main", "master", "primary", "backup", "backups", "volume", "volumes", "all", "every", "entire", "database", "databases"]);

const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Tool calls that delete, drop or overwrite data. An agent should ask a person first (POST /api/v1/approvals with
 * reversible: false); this catches the ones that didn't, like the agent that wiped a production database and its
 * backups in one API call. High when it touched production, backups or everything at once.
 */
export function destructiveIssue(steps: AgentStep[]): Issue | null {
  const hits: { name: string; why: string; blast: boolean }[] = [];
  for (const s of steps) {
    if (s.type !== "tool" && s.type !== "other") continue;
    const input = s.input == null ? "" : typeof s.input === "string" ? s.input : JSON.stringify(s.input);
    const nameHit = words(s.name).find((w) => DESTRUCTIVE_WORDS.has(w));
    const inputHit = DESTRUCTIVE_INPUT.map((r) => input.match(r)).find(Boolean)?.[0];
    if (!nameHit && !inputHit) continue;
    hits.push({ name: s.name || s.type, why: inputHit ? truncate(inputHit.replace(/\s+/g, " "), 60) : nameHit!, blast: words(`${s.name} ${input}`).some((w) => BLAST.has(w)) || /\*\s*(from|;|$)|['"]\*['"]/i.test(input) });
  }
  if (!hits.length) return null;
  const blast = hits.some((h) => h.blast);
  const list = [...new Set(hits.map((h) => `"${h.name}" (${h.why})`))].slice(0, 4).join(", ");
  return {
    code: "DESTRUCTIVE_ACTION",
    severity: blast ? "high" : "medium",
    message: `The agent ran ${hits.length} destructive action${hits.length === 1 ? "" : "s"}: ${list}${blast ? ", touching production, backups or everything at once" : ""}. Actions that delete or overwrite data should wait for a person: send them to Approvals with reversible: false first.`,
  };
}

const PENALTY = { low: 5, medium: 15, high: 35 } as const;

export function agentScore(issues: Issue[]): number {
  return Math.max(0, 100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0));
}

export function totals(steps: AgentStep[]): { cost: number; ms: number } {
  return { cost: steps.reduce((s, x) => s + x.cost_usd, 0), ms: Math.round(steps.reduce((s, x) => s + x.duration_ms, 0)) };
}

/** Compact, size-bounded step log for the AI judge. */
export function stepsLog(steps: AgentStep[]): string {
  return steps
    .slice(0, 150)
    .map((s, i) => {
      const out = s.error ? `ERROR: ${truncate(s.error, 300)}` : truncate(stable(s.output), 600);
      return `${i + 1}. [${s.type}] ${s.name} input=${truncate(stable(s.input), 300)} -> ${out}`;
    })
    .join("\n");
}
