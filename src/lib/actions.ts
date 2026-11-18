import "server-only";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/roles";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Run a server action body; turn auth, validation and unexpected errors into a safe message for the browser. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.reason === "forbidden" ? "You don't have permission to do that." : "Please sign in again." };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
    // Our own thrown messages are written for people; database/driver errors are not.
    if (e instanceof Error && !("code" in e)) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
