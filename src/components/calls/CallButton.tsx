"use client";
import { useTransition } from "react";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startCall } from "@/app/(app)/my-tasks/actions";
import { telDialer, type Dialer } from "@/lib/dialer";
import { readPending, writePending } from "./callStore";

export function CallButton({ lead, size = "sm", dialer = telDialer }: {
  lead: { id: string; name: string | null; process_id: string | null }; size?: "sm" | "default" | "lg"; dialer?: Dialer;
}) {
  const [pending, start] = useTransition();
  const call = () => start(async () => {
    if (readPending()) return void toast.error("Save the outcome of your last call first.");
    const r = await startCall(lead.id);
    if (!r.ok) return void toast.error(r.error);
    writePending({ callId: r.data.callId, leadId: lead.id, name: lead.name || "this lead", processId: lead.process_id, startedAt: Date.now(), hiddenAt: null });
    dialer.placeCall(r.data.phone);
  });
  return (
    <Button size={size} onClick={call} disabled={pending} className="bg-emerald-600 text-white hover:bg-emerald-700">
      <Phone className="size-4" />{pending ? "Calling…" : "Call"}
    </Button>
  );
}
