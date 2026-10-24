import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const PRIVATE = ["/app", "/api/", "/r/", "/reset-password", "/forgot-password", "/invite/", "/unsubscribe", "/verify-email", "/v/"];

/** AI answer engines and their search crawlers are welcome on public pages (GEO: be citable in AI answers). */
const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot", "DuckAssistBot", "meta-externalagent", "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: ["/", "/llms.txt", "/llms-full.txt"], disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
