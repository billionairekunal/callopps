"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

/** Signs out after `minutes` without pointer/keyboard/visibility activity. */
export function IdleSignOut({ minutes }: { minutes: number }) {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        await createClient().auth.signOut();
        window.location.assign("/login?idle=1");
      }, minutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "visibilitychange", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [minutes]);
  return null;
}
