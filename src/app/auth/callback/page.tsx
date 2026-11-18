"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/** Invite links land here with tokens in the URL hash (or a ?code=). Store the session, then set a password. */
export default function AuthCallback() {
  const [error, setError] = useState<string>();
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const code = new URLSearchParams(window.location.search).get("code");
      const access_token = hash.get("access_token"), refresh_token = hash.get("refresh_token");
      const r = access_token && refresh_token
        ? await supabase.auth.setSession({ access_token, refresh_token })
        : code ? await supabase.auth.exchangeCodeForSession(code) : { error: { message: hash.get("error_description") ?? "This link is invalid or has expired." } };
      if (r.error) return setError(r.error.message);
      window.location.replace("/set-password");
    })();
  }, []);
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-slate-600">
      {error ? <p role="alert" className="text-destructive">{error} Ask your admin to send a new invite.</p> : "Signing you in…"}
    </div>
  );
}
