import { metaDescription } from "@/lib/meta";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@/components/analytics";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ProofMyAI · AI Chatbot Testing & Monitoring, AI Agents & n8n", template: "%s · ProofMyAI" },
  description: metaDescription(SITE_DESCRIPTION),
  applicationName: SITE_NAME,
  keywords: [
    "AI chatbot monitoring", "chatbot hallucination checker", "AI chatbot QA", "chatbot quality assurance",
    "AI agent monitoring", "LLM monitoring", "n8n monitoring", "n8n error alerts", "Make.com monitoring",
    "workflow monitoring", "AI audit", "Intercom Fin audit", "chatbot testing",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  category: "technology",
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", url: "/", title: "ProofMyAI · Is your AI telling customers the truth?", description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: "ProofMyAI · Is your AI telling customers the truth?", description: SITE_DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  formatDetection: { telephone: false },
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    // Bing Webmaster Tools (also feeds ChatGPT search and Microsoft Copilot).
    ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0b0e17" }],
};

// Applies the saved theme before paint to avoid a light/dark flash.
const themeScript = `try{var t=localStorage.getItem("ap-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        {process.env.GA_MEASUREMENT_ID ? <Analytics id={process.env.GA_MEASUREMENT_ID.trim()} /> : null}
      </body>
    </html>
  );
}
