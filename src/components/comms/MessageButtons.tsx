"use client";
import { useState, useTransition } from "react";
import { MessageCircle, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { messageTemplates, openMessage } from "@/app/(app)/communications/actions";

type Channel = "whatsapp" | "sms";
const LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", sms: "SMS" };

/** Click-to-WhatsApp and click-to-SMS: pick a template, edit, open the app. Logged on the lead. */
export function MessageButtons({ leadId, leadName }: { leadId: string; leadName: string | null }) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [tpls, setTpls] = useState<{ id: string; name: string; text: string }[]>([]);
  const [tpl, setTpl] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const openDialog = (c: Channel) => start(async () => {
    setChannel(c); setTpl(""); setBody("");
    const r = await messageTemplates(leadId, c);
    setTpls(r.ok ? r.data : []);
  });
  const send = () => {
    // Browsers only allow a new window during the click itself, so open it now and point it at WhatsApp once logged.
    const win = channel === "whatsapp" ? window.open("about:blank", "_blank") : null;
    start(async () => {
    const r = await openMessage({ leadId, channel, templateId: tpl || null, body });
    if (!r.ok) { win?.close(); return void toast.error(r.error); }
    if (win) win.location.href = r.data.url; else window.location.href = r.data.url;
    toast.success(`${LABEL[channel!]} opened and logged`); setChannel(null);
    });
  };
  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => openDialog("whatsapp")}><MessageCircle className="size-4 text-emerald-600" />WhatsApp</Button>
        <Button size="sm" variant="outline" onClick={() => openDialog("sms")}><MessageSquareText className="size-4 text-sky-600" />SMS</Button>
      </div>
      <Dialog open={!!channel} onOpenChange={(o) => !o && setChannel(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{channel ? LABEL[channel] : ""} to {leadName || "this lead"}</DialogTitle>
            <DialogDescription>Opens {channel === "whatsapp" ? "WhatsApp" : "your SMS app"} with the message ready. It is logged on the lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <select aria-label="Template" value={tpl} className="h-10 w-full rounded-md border bg-white px-2 text-sm"
              onChange={(e) => { setTpl(e.target.value); const t = tpls.find((x) => x.id === e.target.value); if (t) setBody(t.text); }}>
              <option value="">{tpls.length ? "Choose a template…" : "No templates yet — write your own"}</option>
              {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Textarea aria-label="Message" rows={5} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type the message…" />
          </div>
          <DialogFooter><Button disabled={pending || !body.trim()} onClick={send}>{pending ? "Opening…" : `Open ${channel ? LABEL[channel] : ""}`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
