"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { recordMfa } from "@/app/(auth)/mfa/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Stage = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "verify"; factorId: string };

export function MfaForm() {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.[0];
      if (verified) return setStage({ kind: "verify", factorId: verified.id });
      // Clear half-finished enrolments, then start a new one.
      for (const f of data?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `CallOpps ${Date.now()}` });
      if (error || !e) return setError(error?.message ?? "Could not start setup.");
      setStage({ kind: "enroll", factorId: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind === "loading") return;
    setBusy(true); setError(undefined);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: code.trim() });
    if (error) { setBusy(false); return setError("That code didn't work. Check your authenticator app and try again."); }
    await recordMfa(stage.kind === "enroll" ? "enrolled" : "verified");
    window.location.assign("/");
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Two-step sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stage.kind === "enroll"
            ? "Admins must use an authenticator app. Scan this code with Google Authenticator or Microsoft Authenticator."
            : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>
      {stage.kind === "enroll" && (
        <div className="space-y-2 rounded-lg border p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.qr} alt="Authenticator QR code" className="mx-auto size-44" />
          <p className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key: <code className="break-all">{stage.secret}</code></p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
          value={code} onChange={(e) => setCode(e.target.value)} required disabled={stage.kind === "loading"} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || stage.kind === "loading"}>{busy ? "Checking…" : "Verify"}</Button>
    </form>
  );
}
