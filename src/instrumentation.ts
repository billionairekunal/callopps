/** Log configuration problems at start-up. The middleware shows them as a setup page instead of a bare 500. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnv } = await import("./lib/env");
  const problems = checkEnv(process.env, process.env.NODE_ENV === "production" && process.env.CALLOPPS_SKIP_ENV_CHECK !== "1");
  if (problems.length) console.error(`CallOpps is not configured:\n- ${problems.join("\n- ")}`);
}
