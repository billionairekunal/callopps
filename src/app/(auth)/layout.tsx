import { Logo } from "@/components/shell/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Logo />
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold leading-tight text-white">Every call counted.<br />Every lead protected.</h2>
          <p className="max-w-md text-sm text-slate-400">
            Your data is encrypted in transit and at rest, stored on servers in India, and every access is controlled and logged.
          </p>
        </div>
        <p className="text-xs text-slate-500">© CallOpps</p>
      </aside>
      <main className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo dark /></div>
          {children}
        </div>
      </main>
    </div>
  );
}
