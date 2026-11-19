/**
 * Apply CallOpps' sign-in settings to a Supabase project (run once per production project).
 *   SUPABASE_ACCESS_TOKEN=... npx tsx scripts/configure-auth.ts <project-ref> https://app.example.com
 * Prints the current values, then the changes, and only applies them with --apply.
 */
import { request } from "node:https";

/** Tiny JSON client on node:https (fetch trips a libuv assertion at exit on Windows with Node 24). */
function call(method: string, url: string, token: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ ok: (res.statusCode ?? 500) < 300, status: res.statusCode ?? 500, json: data ? JSON.parse(data) : {} }));
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

const [ref, site, flag] = process.argv.slice(2);
if (!ref || !/^https:\/\//.test(site ?? "")) { console.error("Usage: configure-auth.ts <project-ref> <https-site-url> [--apply]"); process.exit(1); }
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN (a personal access token from supabase.com/dashboard/account/tokens)."); process.exit(1); }

const base = site.replace(/\/$/, "");
const want = {
  disable_signup: true,                    // no public sign-up: people are invited from CRM Setup
  site_url: base,
  uri_allow_list: `${base}/auth/callback,${base}/**`,
  mfa_totp_enroll_enabled: true, mfa_totp_verify_enabled: true,
  password_hibp_enabled: true,             // refuse leaked passwords (needs the Pro plan)
  password_min_length: 10,
  refresh_token_rotation_enabled: true,
};
async function main() {
  const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const now = (await call("GET", url, token!)).json;
  for (const [k, v] of Object.entries(want)) console.log(`${now[k] === v ? "  ok " : "  set"} ${k}: ${JSON.stringify(now[k])} -> ${JSON.stringify(v)}`);
  if (flag !== "--apply") { console.log("\nDry run. Re-run with --apply to change these."); return; }
  const r = await call("PATCH", url, token!, want);
  console.log(r.ok ? "\nApplied." : `\nFailed: ${r.status} ${JSON.stringify(r.json)}`);
  process.exitCode = r.ok ? 0 : 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
export {};
