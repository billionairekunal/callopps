/** Configuration problems, as plain sentences. Empty means ready. Checked once when the server starts. */
export function checkEnv(env: Record<string, string | undefined>, production: boolean): string[] {
  const out: string[] = [];
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CALLOPPS_MASTER_KEY"])
    if (!env[k]?.trim()) out.push(`${k} is missing`);
  if (env.CALLOPPS_MASTER_KEY?.trim() && Buffer.from(env.CALLOPPS_MASTER_KEY, "base64").length !== 32)
    out.push("CALLOPPS_MASTER_KEY must be 32 bytes, base64-encoded");
  if (production && !/^https:\/\/[^/]+/.test(env.NEXT_PUBLIC_SITE_URL ?? ""))
    out.push("NEXT_PUBLIC_SITE_URL must be the public https address, e.g. https://app.example.com (invite emails link to it)");
  return out;
}
