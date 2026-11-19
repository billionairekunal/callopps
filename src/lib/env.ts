/** Decoded byte length of a base64 string, without Node's Buffer (this also runs in edge middleware). */
const b64Bytes = (s: string) => { try { return atob(s.trim()).length; } catch { return -1; } };

/** Configuration problems, as plain sentences that name settings but never show their values. Empty means ready. */
export function checkEnv(env: Record<string, string | undefined>, production: boolean): string[] {
  const out: string[] = [];
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CALLOPPS_MASTER_KEY"])
    if (!env[k]?.trim()) out.push(`${k} is missing`);
  if (env.CALLOPPS_MASTER_KEY?.trim() && b64Bytes(env.CALLOPPS_MASTER_KEY) !== 32)
    out.push("CALLOPPS_MASTER_KEY must be 32 bytes, base64-encoded");
  if (production && !/^https:\/\/[^/]+/.test(env.NEXT_PUBLIC_SITE_URL ?? ""))
    out.push("NEXT_PUBLIC_SITE_URL must be the public https address, e.g. https://app.example.com (invite emails link to it)");
  return out;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Shown instead of a bare 500 when the deployment is missing settings. */
export function setupPage(problems: string[]) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CallOpps setup needed</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px}main{max-width:620px;margin:10vh auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px}h1{font-size:20px;margin:0 0 8px}li{margin:6px 0;font-family:ui-monospace,monospace;font-size:14px}p{color:#475569;line-height:1.5}</style></head>
<body><main><h1>CallOpps isn't configured yet</h1><p>This deployment is missing settings:</p><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
<p>Add them in Vercel → your project → Settings → Environment Variables (Production), then go to Deployments → ⋯ → <b>Redeploy</b>. The values that start with NEXT_PUBLIC_ are built into the app, so a redeploy is required.</p></main></body></html>`;
}
