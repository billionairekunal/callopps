"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import type { Result } from "@/app/(app)/crm-setup/actions";

/** Run a server action with a toast on success/failure. */
export function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, success?: string) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const r = await fn();
        if (r.ok) { if (success) toast.success(success); resolve(true); }
        else { toast.error(r.error); resolve(false); }
      }));
  return { pending, run };
}
