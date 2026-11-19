/** Fail fast on a misconfigured deployment instead of failing on the first login or decrypt. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnv } = await import("./lib/env");
  const problems = checkEnv(process.env, process.env.NODE_ENV === "production" && process.env.CALLOPPS_SKIP_ENV_CHECK !== "1");
  if (problems.length) throw new Error(`CallOpps is not configured:\n- ${problems.join("\n- ")}`);
}
