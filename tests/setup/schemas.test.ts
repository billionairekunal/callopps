import { test, expect } from "vitest";
import { dispositionSchema, orgSettingsSchema, lookupSchema, inviteSchema } from "@/lib/setup/schemas";

const pid = "8f8c9c51-2a6f-4b8e-9a2e-0d7b1c3e4f50";
test("disposition outcome must be in_progress|won|lost", () => {
  for (const o of ["in_progress", "won", "lost"])
    expect(dispositionSchema.safeParse({ process_id: pid, label: "X", outcome: o, counts_presentation: false, sort: 0 }).success).toBe(true);
  expect(dispositionSchema.safeParse({ process_id: pid, label: "X", outcome: "maybe", counts_presentation: false, sort: 0 }).success).toBe(false);
});
test("idle timeout 4 rejected, 5 and 240 accepted, 241 rejected", () => {
  const ok = (n: number) => orgSettingsSchema.safeParse({ name: "C", idle_timeout_minutes: n }).success;
  expect([ok(4), ok(5), ok(240), ok(241)]).toEqual([false, true, true, false]);
});
test("empty or blank label rejected", () => {
  expect(lookupSchema.safeParse({ name: "   " }).success).toBe(false);
  expect(dispositionSchema.safeParse({ process_id: pid, label: "", outcome: "won", counts_presentation: false, sort: 0 }).success).toBe(false);
});
test("invite needs a valid email and a known role", () => {
  expect(inviteSchema.safeParse({ email: "a@b.in", fullName: "A", role: "caller" }).success).toBe(true);
  expect(inviteSchema.safeParse({ email: "nope", fullName: "A", role: "caller" }).success).toBe(false);
  expect(inviteSchema.safeParse({ email: "a@b.in", fullName: "A", role: "owner" }).success).toBe(false);
});
