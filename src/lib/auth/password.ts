import { z } from "zod";

const COMMON = new Set(["password123", "1234567890", "qwertyuiop", "password@123", "welcome@123", "admin@12345", "callopps123"]);
export const passwordSchema = z.string().min(10, "Use at least 10 characters.")
  .refine((p) => !COMMON.has(p.toLowerCase()), "That password is too common.");
