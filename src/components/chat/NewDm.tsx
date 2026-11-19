"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { openDm } from "@/app/(app)/chat/actions";

export function NewDm({ people }: { people: { user_id: string; full_name: string }[] }) {
  const router = useRouter();
  return (
    <select aria-label="Message someone" defaultValue="" className="h-9 w-full rounded-md border bg-white px-2 text-sm" onChange={async (e) => {
      const id = e.target.value; e.target.value = "";
      if (!id) return;
      const r = await openDm(id);
      if (r.ok) router.push(`/chat?c=${r.data}`); else toast.error(r.error);
    }}>
      <option value="">+ Message someone…</option>
      {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
    </select>
  );
}
