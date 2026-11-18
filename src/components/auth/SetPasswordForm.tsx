"use client";
import { useActionState } from "react";
import { setPassword } from "@/app/(auth)/set-password/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, {});
  return (
    <form action={action} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Set your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">At least 10 characters.</p>
      </div>
      <div className="space-y-2"><Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
      <div className="space-y-2"><Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required /></div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>Save password</Button>
    </form>
  );
}
