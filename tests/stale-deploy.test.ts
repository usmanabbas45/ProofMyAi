import { describe, expect, it } from "vitest";
import { get } from "@/lib/db";
import { reportError } from "@/lib/monitoring";
import { isStaleDeployError } from "@/lib/stale-deploy";
import { freshDb } from "./helpers";

describe("pages left open across a deploy", () => {
  it("recognises the server-action mismatch, in both wordings", () => {
    expect(isStaleDeployError(new Error("Failed to find Server Action. This request might be from an older or newer deployment. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action"))).toBe(true);
    expect(isStaleDeployError(new Error('Server Action "7f3a9c" was not found on the server.'))).toBe(true);
    expect(isStaleDeployError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleDeployError(undefined)).toBe(false);
  });

  it("isn't recorded as a server error (no admin alert), but real errors still are", async () => {
    freshDb();
    const count = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM server_errors")!.n;
    await reportError("POST /contact", new Error("Failed to find Server Action. This request might be from an older or newer deployment."));
    expect(count()).toBe(0);
    await reportError("POST /contact", new Error("database is locked"));
    expect(count()).toBe(1);
  });
});
