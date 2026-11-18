import { z } from "zod";

const id = z.string().uuid();
const name = z.string().trim().min(1, "Required").max(120);
export const ROLES = ["super_admin", "admin", "team_leader", "caller"] as const;
export const LOOKUP_TABLES = ["processes", "product_categories", "products", "lead_types", "teams"] as const;
export type LookupTable = (typeof LOOKUP_TABLES)[number];

export const lookupSchema = z.object({
  id: id.optional(),
  name,
  category_id: id.nullable().optional(),
  team_leader_id: id.nullable().optional(),
  active: z.boolean().optional(),
});
export const dispositionSchema = z.object({
  id: id.optional(),
  process_id: id,
  label: name,
  outcome: z.enum(["in_progress", "won", "lost"]),
  counts_presentation: z.boolean(),
  sort: z.number().int().min(0).max(10_000),
});
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: name,
  role: z.enum(ROLES),
  teamId: id.nullable().optional(),
});
export const orgSettingsSchema = z.object({
  name,
  idle_timeout_minutes: z.number().int().min(5).max(240),
});
