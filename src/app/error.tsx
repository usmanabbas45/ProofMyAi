"use client";

import { useEffect, useState } from "react";
import { isStaleDeployError, reloadOnceForNewVersion } from "@/lib/stale-deploy";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const stale = isStaleDeployError(error);
  const [reloading, setReloading] = useState(stale);
  useEffect(() => {
    if (stale) setReloading(reloadOnceForNewVersion());
  }, [stale]);

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>{stale ? "🔄" : "⚠️"}</div>
        {stale ? (
          <>
            <h2>ProofMyAI was just updated</h2>
            <p className="sub">{reloading ? "Reloading the page so you get the latest version…" : "Please reload the page and try again. Anything you typed may need to be entered again."}</p>
            <button className="btn" onClick={() => window.location.reload()}>Reload page</button>
          </>
        ) : (
          <>
            <h2>Something went wrong</h2>
            <p className="sub">The error has been logged. Please try again.</p>
            <button className="btn" onClick={() => reset()}>Try again</button>
          </>
        )}
      </div>
    </div>
  );
}
