import Link from "next/link";
import { NavLinks, ProjectSwitcher, ThemeToggle, type NavItem } from "@/components/client";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { accessibleProjects, projectAccess } from "@/lib/projects";
import { logoutAction } from "../../../(auth)/actions";
import { VerifyBanner } from "@/components/verify-banner";
import { SubmitButton } from "@/components/client";
import { deleteDemoAction } from "../../demo-actions";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { project, role } = projectAccess(user.id, Number(id));
  const base = `/app/p/${project.id}`;
  const open = get<{ n: number }>("SELECT COUNT(*) AS n FROM incidents WHERE project_id = ? AND resolved = 0", project.id)?.n ?? 0;

  const monitor: NavItem[] = [
    { href: base, label: "Overview", icon: "📊" },
    { href: `${base}/analytics`, label: "Analytics", icon: "📈" },
    { href: `${base}/trust`, label: "Trust report", icon: "🛡️" },
    { href: `${base}/value`, label: "Proof of value", icon: "🏆" },
    { href: `${base}/approvals`, label: "Approvals", icon: "✋", badge: get<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE project_id = ? AND status = 'pending'", project.id)?.n ?? 0, badgeTone: "brand" },
    ...(role === "viewer" ? [] : [{ href: `${base}/connect`, label: "Connect", icon: "➕" }]),
    { href: `${base}/live`, label: "Live tracking", icon: "📡" },
    { href: `${base}/traces`, label: "Traces", icon: "🔗" },
    { href: `${base}/chatbot`, label: "Chatbot audits", icon: "💬" },
    { href: `${base}/tests`, label: "Chatbot tests", icon: "🧪", badge: get<{ n: number }>("SELECT COUNT(*) AS n FROM test_suggestions WHERE project_id = ?", project.id)?.n ?? 0, badgeTone: "brand" },
    { href: `${base}/agents`, label: "AI agents", icon: "🤖" },
    { href: `${base}/workflows`, label: "n8n & Make", icon: "⚙️" },
    { href: `${base}/crm`, label: "CRM", icon: "🗂️", badge: get<{ n: number }>("SELECT COUNT(*) AS n FROM incidents WHERE project_id = ? AND resolved = 0 AND code LIKE 'CRM_%'", project.id)?.n ?? 0 },
    { href: `${base}/sheets`, label: "Google Sheets", icon: "📗", badge: get<{ n: number }>("SELECT COUNT(*) AS n FROM sheet_watches WHERE project_id = ? AND status IN ('problem', 'error')", project.id)?.n ?? 0 },
    { href: `${base}/uptime`, label: "Uptime", icon: "🟢", badge: get<{ n: number }>("SELECT COUNT(*) AS n FROM uptime_monitors WHERE project_id = ? AND status = 'down'", project.id)?.n ?? 0 },
    { href: `${base}/incidents`, label: "Incidents", icon: "🚨", badge: open },
  ];
  const manage: NavItem[] = [
    ...(role === "owner" ? [{ href: `${base}/alerts`, label: "Alerts", icon: "🔔" }, { href: `${base}/settings`, label: "Settings & AI model", icon: "🛠️" }] : []),
    { href: `${base}/team`, label: "Team", icon: "👥" },
    { href: `${base}/guide`, label: "Setup guide", icon: "📘" },
    { href: "/app/billing", label: "Plan & billing", icon: "💳" },
    { href: "/app/referrals", label: "Invite & earn", icon: "🎁" },
    { href: "/app/account", label: "Account", icon: "👤" },
    { href: "/app/support", label: "Help & support", icon: "🛟" },
    { href: "/app/feedback", label: "Share feedback", icon: "⭐" },
    ...(isAdmin(user.email) ? [{ href: "/app/admin", label: "Admin", icon: "🛡️" }] : []),
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/app?new=1" className="logo"><span className="logo-mark">✓</span>ProofMyAI</Link>
        <ProjectSwitcher projects={accessibleProjects(user.id).map((p) => ({ id: p.id, name: p.role === "owner" ? p.name : `${p.name} (shared)` }))} current={project.id} />
        <div className="nav-label">Monitor</div>
        <NavLinks items={monitor} />
        <div className="nav-label">Manage</div>
        <NavLinks items={manage} />
        <div className="sidebar-foot">
          <span className="sub" style={{ padding: "0 8px", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</span>
          <div className="row" style={{ padding: "0 4px" }}>
            <ThemeToggle />
            <form action={logoutAction}><button className="btn btn-ghost btn-sm">Log out</button></form>
          </div>
        </div>
      </aside>
      <div className="main">
        <nav className="mobile-nav" aria-label="Sections"><NavLinks items={[...monitor, ...manage]} /></nav>
        <div className="content">
          <VerifyBanner userId={user.id} email={user.email} />
          {project.is_demo ? (
            <div className="alert alert-info verify-banner" role="status">
              <span>✨ <strong>This is a demo project with sample data</strong> for a made-up shop. Click around: audits, safety checks, Fix with AI, agents, workflows and uptime are all filled in. It doesn&apos;t count towards your plan.</span>
              <span className="row" style={{ gap: 8 }}>
                <Link href="/app?new=1" className="btn btn-sm">Connect my own AI →</Link>
                <form action={deleteDemoAction}><SubmitButton className="btn btn-ghost btn-sm" pendingText="Deleting…" confirm="Delete the demo project?">Delete demo</SubmitButton></form>
              </span>
            </div>
          ) : null}
          {role !== "owner" ? <div className="alert alert-info role-banner">{role === "viewer" ? "👁️ View-only access: you can see everything but not change it." : "✏️ Editor access: you can connect tools and run checks. Settings and team are managed by the owner."}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
