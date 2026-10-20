import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { meetingInput, meetingTimestamp } from "@/lib/crmMeeting";

export function MeetingDialog({ open, onOpenChange, value, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; value?: string | null; onSave: (date: string) => Promise<boolean> }) {
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setDate(meetingInput(value)); }, [open, value]);
  const save = async () => {
    const timestamp = meetingTimestamp(date);
    if (!timestamp) return;
    setSaving(true);
    try { if (await onSave(timestamp)) onOpenChange(false); } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Call Agendada</DialogTitle></DialogHeader>
    <Label htmlFor="meeting-date">Data e hora da reunião (Brasília)</Label>
    <Input id="meeting-date" type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} />
    <Button onClick={save} disabled={!meetingTimestamp(date) || saving}>{saving ? "Salvando..." : "Salvar reunião"}</Button>
  </DialogContent></Dialog>;
}