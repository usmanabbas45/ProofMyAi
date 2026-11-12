import { notFound } from "next/navigation";
import { all, get, run } from "./db";
import { randomToken } from "./security";
import { asSeenBy, projectRole, sharedProjects, type Role } from "./team";

export interface Project {
  id: number;
  user_id: number;
  name: string;
  api_key: string;
  alert_webhook: string | null;
  alert_email: string | null;
  agent_cost_budget_usd: number;
  agent_max_steps: number;
  agent_max_ms: number;
  agent_ai_review: number;
  redact_pii: number;
  mask_terms: string | null;
  retention_days: number;
  store_text: number;
  use_ai: number;
  reply_timeout_sec: number;
  promise_hours?: number;
  report_brand: string | null;
  weekly_digest: number;
  last_digest_at: string | null;
  is_demo: number;
  created_at: string;
}

export function newApiKey(): string {
  return `ap_live_${randomToken(24)}`;
}

export function createProject(userId: number, name: string): number {
  const clean = name.trim().slice(0, 100) || "My project";
  const id = run("INSERT INTO projects (user_id, name, api_key, legacy_email_migrated) VALUES (?, ?, ?, 1)", userId, clean, newApiKey()).lastInsertRowid;
  // Alerts work from day one: medium and high problems go to the owner's email until they choose other channels.
  const owner = get<{ email: string }>("SELECT email FROM users WHERE id = ?", userId);
  if (owner) run("INSERT INTO alert_channels (project_id, type, target, min_severity) VALUES (?, 'email', ?, 'medium')", id, owner.email);
  return id;
}

/** Projects the user owns. */
export function listProjects(userId: number): Project[] {
  return all<Project>("SELECT * FROM projects WHERE user_id = ? ORDER BY id", userId);
}

/** Owned projects plus projects shared with the user (team member), with the user's role. */
export function accessibleProjects(userId: number): (Project & { role: Role })[] {
  return [...listProjects(userId).map((p) => ({ ...p, role: "owner" as Role })), ...sharedProjects(userId)];
}

/**
 * Loads a project the user can access (owner or team member) and 404s otherwise (prevents cross-account access).
 * Pass `need` to require a minimum role: "editor" to change things, "owner" for settings, billing-related changes and team.
 * Viewers get the project without its API key.
 */
export function projectAccess(userId: number, projectId: number, need: Role = "viewer"): { project: Project; role: Role } {
  const role = Number.isInteger(projectId) ? projectRole(userId, projectId) : null;
  if (!role) notFound();
  const rank: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };
  if (rank[role] < rank[need]) throw new AccessError(role);
  const p = get<Project>("SELECT * FROM projects WHERE id = ?", projectId);
  if (!p) notFound();
  return { project: asSeenBy(p, role), role };
}

export class AccessError extends Error {
  constructor(public role: Role) { super(role === "viewer" ? "You have view-only access to this project." : "Only the project owner can do that."); }
}

/** Loads a project and 404s unless it belongs to the user (owner only). */
export function ownedProject(userId: number, projectId: number): Project {
  const p = Number.isInteger(projectId) ? get<Project>("SELECT * FROM projects WHERE id = ? AND user_id = ?", projectId, userId) : undefined;
  if (!p) notFound();
  return p;
}

/** Authenticates ingestion API calls: `Authorization: Bearer ap_live_...` */
export function projectFromRequest(req: Request): Project | null {
  const header = req.headers.get("authorization") ?? "";
  const key = header.replace(/^Bearer\s+/i, "").trim() || req.headers.get("x-api-key")?.trim() || "";
  if (!key.startsWith("ap_live_")) return null;
  // Projects of suspended accounts stop accepting API data.
  return get<Project>("SELECT p.* FROM projects p JOIN users u ON u.id = p.user_id WHERE p.api_key = ? AND u.suspended_at IS NULL", key) ?? null;
}
