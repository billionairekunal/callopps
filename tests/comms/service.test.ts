import { test, expect, vi } from "vitest";
import { fillTemplate, messageLink, openMessage, type CommsCtx } from "@/lib/comms/service";
import type { Role, Session } from "@/lib/auth/roles";

const LEAD = "11111111-1111-4111-8111-111111111111", TPL = "22222222-2222-4222-8222-222222222222";

function ctx(role: Role = "caller", lead: { assigned_to: string | null } = { assigned_to: "me" }) {
  const session: Session = { userId: "me", orgId: "org", role, teamId: "T", aal: "aal2", fullName: "Asha" };
  const repo = {
    getLead: vi.fn(async (id: string) => (id === LEAD ? { id, name: "Ravi", phone_enc: "enc", ...lead } : null)),
    template: vi.fn(async (id: string) => (id === TPL ? { id, channel: "whatsapp" as const, body: "Hi {name}" } : null)),
    insert: vi.fn(async () => {}), insertEvent: vi.fn(async () => {}), touch: vi.fn(async () => {}),
  };
  const c: CommsCtx = { session, repo, reveal: vi.fn(async () => "9876543210"), audit: vi.fn(async () => {}) };
  return { c, repo };
}

test("fillTemplate swaps known placeholders and leaves others", () => {
  expect(fillTemplate("Hi {name}, this is {agent} from {centre}. {x}", { name: "Ravi", agent: "Asha", centre: "SGI" }))
    .toBe("Hi Ravi, this is Asha from SGI. {x}");
  expect(fillTemplate("Hi {name}", { name: "" })).toBe("Hi there");
});
test("messageLink builds wa.me and sms links with the text encoded", () => {
  expect(messageLink("whatsapp", "9876543210", "Hi & bye")).toBe("https://wa.me/919876543210?text=Hi%20%26%20bye");
  expect(messageLink("sms", "9876543210", "Hi")).toBe("sms:+919876543210?body=Hi");
});
test("the assignee opens a message: logged, timeline, audit, link returned", async () => {
  const { c, repo } = ctx();
  expect(await openMessage(c, { leadId: LEAD, channel: "whatsapp", templateId: TPL, body: "Hi Ravi" }))
    .toEqual({ url: "https://wa.me/919876543210?text=Hi%20Ravi" });
  expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ lead_id: LEAD, user_id: "me", channel: "whatsapp", template_id: TPL, body: "Hi Ravi" }));
  expect(repo.insertEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "message", lead_id: LEAD }));
  expect(c.audit).toHaveBeenCalledWith("message.open", "lead", LEAD, { channel: "whatsapp" });
});
test("someone else's lead, an admin, or a template of the other channel are refused", async () => {
  await expect(openMessage(ctx("team_leader", { assigned_to: "x" }).c, { leadId: LEAD, channel: "sms", body: "x" })).rejects.toThrow("forbidden");
  await expect(openMessage(ctx("admin", { assigned_to: "x" }).c, { leadId: LEAD, channel: "sms", body: "x" })).rejects.toThrow("forbidden");
  await expect(openMessage(ctx().c, { leadId: LEAD, channel: "sms", templateId: TPL, body: "x" })).rejects.toThrow(/template/i);
  await expect(openMessage(ctx().c, { leadId: LEAD, channel: "sms", body: "  " })).rejects.toThrow();
});

test("fillTemplate ignores built-in object names like {constructor}", () => {
  expect(fillTemplate("Hi {name} {constructor} {toString}", { name: "Ravi" })).toBe("Hi Ravi {constructor} {toString}");
});
