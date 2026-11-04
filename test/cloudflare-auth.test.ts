import { describe, expect, it, vi } from "vitest";
import { checkCloudflareAccess } from "../scripts/check-cloudflare-auth.js";

const credentials = { accountId: "a".repeat(32), apiToken: "never-print-this-token" };

describe("deployment credential preflight", () => {
  it("only reads metadata and does not claim to verify write permissions", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ success: true, result: [] }));
    const messages = await checkCloudflareAccess(credentials, request);
    expect(request.mock.calls.map(([url]) => String(url).split("/").slice(7).join("/")))
      .toEqual(["workers/subdomain", "workers/scripts", "secrets_store/stores"]);
    for (const [, options] of request.mock.calls) expect(options).toMatchObject({ method: "GET" });
    expect(messages.at(-1)).toBe("Read access verified. Write permissions are checked by the deployment itself.");
    expect(messages.join("\n")).not.toContain(credentials.apiToken);
  });

  it("identifies missing state-store access even when Worker access succeeds", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).includes("secrets_store")
      ? Response.json({ success: false, errors: [{ code: 10000, message: credentials.apiToken }] }, { status: 403 })
      : Response.json({ success: true, result: {} }));
    const failure = await checkCloudflareAccess(credentials, request).catch((error: Error) => error.message);
    expect(failure).toContain("Workers scripts: read access verified");
    expect(failure).toContain("Alchemy state-store Secrets Store: HTTP 403 (Cloudflare code 10000)");
    expect(failure).toContain("Secrets Store Edit");
    expect(failure).toContain("CLOUDFLARE_API_TOKEN");
    expect(failure).not.toContain(credentials.apiToken);
  });

  it("fails on API-level errors even with HTTP 200 and redacts fetch failures", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes("secrets_store")) throw new Error(credentials.apiToken);
      return Response.json({ success: false, errors: [{ code: 10000 }] });
    });
    const failure = await checkCloudflareAccess(credentials, request).catch((error: Error) => error.message);
    expect(failure).toContain("HTTP 200 (Cloudflare code 10000)");
    expect(failure).toContain("API probe failed or timed out");
    expect(failure).not.toContain(credentials.apiToken);
  });

  it("rejects missing credentials and malformed account ids before making requests", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(checkCloudflareAccess({}, request)).rejects.toThrow("repository Actions secrets");
    await expect(checkCloudflareAccess({ ...credentials, accountId: "invalid/id" }, request)).rejects.toThrow("32-character");
    expect(request).not.toHaveBeenCalled();
  });
});
