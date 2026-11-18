"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { IDLE_KEY, idleExpired, latestActivity } from "@/lib/auth/idle";

const read = () => { try { return localStorage.getItem(IDLE_KEY); } catch { return null; } };
const write = (t: number) => { try { localStorage.setItem(IDLE_KEY, String(t)); } catch { /* storage blocked: this tab only */ } };

/** Signs this device out after `minutes` with no activity in any CallOpps tab. Other devices stay signed in. */
export function IdleSignOut({ minutes }: { minutes: number }) {
  useEffect(() => {
    let last = Date.now(), lastWrite = 0;
    write(last);
    const touch = () => {
      last = Date.now();
      if (last - lastWrite > 5_000) { write(last); lastWrite = last; } // throttle storage writes
    };
    const events = ["pointerdown", "keydown", "visibilitychange", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(async () => {
      if (!idleExpired(latestActivity(last, read()), Date.now(), minutes)) return;
      clearInterval(timer);
      await createClient().auth.signOut({ scope: "local" });
      window.location.assign("/login?idle=1");
    }, 30_000);
    return () => { clearInterval(timer); events.forEach((e) => window.removeEventListener(e, touch)); };
  }, [minutes]);
  return null;
}
