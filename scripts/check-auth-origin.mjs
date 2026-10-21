import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const input = process.argv[2] || process.env.APP_URL;
if (!input || !process.env.NEON_AUTH_BASE_URL) {
  console.error(
    "Set NEON_AUTH_BASE_URL and pass the exact application origin. Usage: npm run auth:check-origin -- https://192.168.1.6:3443",
  );
  process.exit(1);
}
const parsed = new URL(input);
if (
  !["http:", "https:"].includes(parsed.protocol) ||
  parsed.username ||
  parsed.password ||
  input !== parsed.origin
)
  throw new Error(
    "Use an exact HTTP(S) origin, including its port, with no path or trailing slash.",
  );
const endpoint = new URL(
  process.env.NEON_AUTH_BASE_URL.replace(/\/$/, "") + "/sign-in/email",
);
if (endpoint.protocol !== "https:")
  throw new Error("The Neon Auth endpoint must use HTTPS.");
// A single intentionally nonexistent account probes the origin check, never real credentials.
const result = await fetch(endpoint, {
  method: "POST",
  headers: { Origin: parsed.origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "spplast-origin-check@example.invalid",
    password: "not-a-real-account-password",
  }),
  signal: AbortSignal.timeout(15000),
});
const body = await result.json().catch(() => ({}));
if (body.code === "INVALID_ORIGIN") {
  console.error(
    `BLOCKED: ${parsed.origin}. Add this exact origin in the connected Neon branch: Auth → Configuration → Domains. Preserve existing domains. No trailing slash.`,
  );
  process.exitCode = 1;
} else if (result.status === 401 && body.code === "INVALID_EMAIL_OR_PASSWORD") {
  console.log(
    `ACCEPTED: ${parsed.origin}. Neon reached credential validation. This does not verify a real account login.`,
  );
} else {
  console.error(
    `INCONCLUSIVE: HTTP ${result.status}, code ${String(body.code || "unknown")}. Real sign-in still needs verification.`,
  );
  process.exitCode = 1;
}
