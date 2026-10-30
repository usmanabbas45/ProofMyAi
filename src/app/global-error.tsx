"use client";

import { useEffect } from "react";
import { isStaleDeployError, reloadOnceForNewVersion } from "@/lib/stale-deploy";

/** Last-resort error page (errors in the root layout). Out-of-date pages after a deploy reload themselves once. */
export default function GlobalError({ error }: { error: Error }) {
  const stale = isStaleDeployError(error);
  useEffect(() => {
    if (stale) reloadOnceForNewVersion();
  }, [stale]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 16, textAlign: "center" }}>
        <div>
          <h2>{stale ? "ProofMyAI was just updated" : "Something went wrong"}</h2>
          <p>{stale ? "Reloading the page so you get the latest version…" : "The error has been logged. Please reload the page."}</p>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 18px", fontSize: 15, cursor: "pointer" }}>Reload page</button>
        </div>
      </body>
    </html>
  );
}
