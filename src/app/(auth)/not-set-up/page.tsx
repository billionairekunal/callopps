import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

export default function NotSetUp() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Account not set up</h1>
      <p className="text-sm text-muted-foreground">
        Your sign-in worked, but your account isn&apos;t linked to an active centre. Ask your Super Admin to add or reactivate you.
      </p>
      <form action={logout}><Button variant="outline" type="submit">Sign out</Button></form>
    </div>
  );
}
