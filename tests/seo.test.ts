import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { headings, Prose } from "@/components/prose";
import { POSTS } from "@/lib/blog";
import { COMPARISONS } from "@/lib/compare";
import { SOLUTIONS } from "@/lib/seo";
import { indexNowKey, submitToIndexNow } from "@/lib/indexnow";
import { llmsFullTxt, llmsTxt } from "@/lib/llms";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("blog content", () => {
  it("has unique slugs, answer-first summaries and FAQs", () => {
    expect(new Set(POSTS.map((p) => p.slug)).size).toBe(POSTS.length);
    for (const p of POSTS) {
      expect(p.answer.length).toBeGreaterThan(80);
      expect(p.description.length).toBeLessThanOrEqual(200);
      expect(p.faqs.length).toBeGreaterThanOrEqual(3);
      expect(headings(p.body).length).toBeGreaterThanOrEqual(3);
      // Internal links must point at pages that exist.
      for (const [, href] of p.body.matchAll(/\]\((\/[^)#]*)/g)) {
        expect([
          "/signup", "/docs", "/free-audit", "/tools/ai-chatbot-checker", "/tools/n8n-workflow-checker", ...SOLUTIONS.map((x) => `/solutions/${x.slug}`),
          "/solutions/ai-chatbot-monitoring", "/solutions/n8n-workflow-monitoring", "/solutions/ai-agent-monitoring",
          "/solutions/ai-chatbot-compliance-monitoring", "/solutions/ai-chatbot-monitoring-for-agencies", "/solutions/crm-monitoring", "/solutions/ai-agent-human-approval", "/solutions/grok-chatbot-monitoring",
          ...POSTS.map((x) => `/blog/${x.slug}`), ...COMPARISONS.map((c) => `/compare/${c.slug}`),
        ]).toContain(href);
      }
    }
  });

  it("renders the Markdown subset safely", () => {
    const html = renderToStaticMarkup(Prose({ source: "## Title\n\nA **bold** [link](/docs) and <script>x</script>.\n\n- one\n- two\n\n1. a\n2. b\n\n> tip" }));
    expect(html).toContain('<h2 id="title">Title</h2>');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="/docs"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>a</li><li>b</li></ol>");
    expect(html).toContain('class="callout"');
    const table = renderToStaticMarkup(Prose({ source: "| Tool | Code? |\n|---|---|\n| **ProofMyAI** | No |" }));
    expect(table).toContain('<div class="table-wrap"><table><thead><tr><th>Tool</th><th>Code?</th></tr></thead>');
    expect(table).toContain("<td><strong>ProofMyAI</strong></td><td>No</td>");
  });
});

describe("GEO and search engines", () => {
  it("publishes llms.txt with product facts, pages and guides", () => {
    const t = llmsTxt();
    expect(t.startsWith("# ProofMyAI\n\n> ")).toBe(true);
    expect(t).toContain("/docs");
    for (const p of POSTS) expect(t).toContain(`/blog/${p.slug}`);
    expect(llmsFullTxt()).toContain("## Frequently asked questions");
  });

  it("welcomes AI crawlers and lists blog posts in the sitemap, without the login page", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    expect(rules.some((x) => Array.isArray(x.userAgent) && x.userAgent.includes("GPTBot") && x.userAgent.includes("ClaudeBot"))).toBe(true);
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/blog"))).toBe(true);
    expect(urls.filter((u) => u.includes("/blog/")).length).toBe(POSTS.length);
    expect(urls.some((u) => u.endsWith("/login"))).toBe(false);
  });

  it("submits pages to IndexNow with a stable key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const r = await submitToIndexNow(["https://proofmyai.com/", "https://proofmyai.com/", "https://evil.com/x"], fetcher as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, status: 202, count: 1 });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ host: "proofmyai.com", key: indexNowKey(), keyLocation: "https://proofmyai.com/indexnow-key.txt", urlList: ["https://proofmyai.com/"] });
    expect(indexNowKey()).toMatch(/^[a-f0-9]{32}$/);
    expect(indexNowKey()).toBe(indexNowKey());
  });
});
