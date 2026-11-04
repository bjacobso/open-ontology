import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checks = [
  { path: "workers/subdomain", label: "Workers subdomain", permission: "Account Settings Read" },
  { path: "workers/scripts", label: "Workers scripts", permission: "Workers Scripts Edit" },
  { path: "secrets_store/stores", label: "Alchemy state-store Secrets Store", permission: "Secrets Store Edit" },
] as const;

/** Read-only API probes. Never print credentials, account metadata, or secret values. */
export const checkCloudflareAccess = async (
  credentials: { readonly accountId?: string; readonly apiToken?: string },
  request: typeof fetch = fetch,
): Promise<readonly string[]> => {
  const { accountId, apiToken } = credentials;
  if (!accountId || !apiToken) throw new Error("Configure the CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN repository Actions secrets.");
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID must be the 32-character Cloudflare account ID.");
  const results = await Promise.all(checks.map(async ({ path, label, permission }) => {
    try {
      const response = await request(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json() as { readonly success?: boolean; readonly errors?: readonly { readonly code?: number }[] };
      if (response.ok && body.success === true) return { ok: true, message: `${label}: read access verified` };
      const codes = (body.errors ?? []).flatMap((e) => typeof e.code === "number" ? [e.code] : []);
      return { ok: false, message: `${label}: HTTP ${response.status}${codes.length ? ` (Cloudflare code ${codes.join(", ")})` : ""}. Check token validity, account scope, and Account > ${permission}.` };
    } catch {
      // Fetch errors can contain request details; keep the diagnostic credential-free.
      return { ok: false, message: `${label}: API probe failed or timed out. Check Cloudflare API availability.` };
    }
  }));
  const failures = results.filter((result) => !result.ok);
  if (failures.length) throw new Error([
    "Cloudflare deployment credential preflight failed:",
    ...results.map((result) => `- ${result.message}`),
    "Update the repository Actions secret CLOUDFLARE_API_TOKEN or its Cloudflare permissions, then rerun the failed workflow.",
    "Alchemy's remote state store needs Secrets Store Edit in addition to the Worker deployment permissions; a Wrangler-only token may lack it.",
  ].join("\n"));
  return [...results.map((result) => result.message), "Read access verified. Write permissions are checked by the deployment itself."];
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const messages = await checkCloudflareAccess({
      ...(process.env.CLOUDFLARE_ACCOUNT_ID ? { accountId: process.env.CLOUDFLARE_ACCOUNT_ID } : {}),
      ...(process.env.CLOUDFLARE_API_TOKEN ? { apiToken: process.env.CLOUDFLARE_API_TOKEN } : {}),
    });
    console.log(messages.join("\n"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Cloudflare credential preflight failed.");
    process.exitCode = 1;
  }
}
