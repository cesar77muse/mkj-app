import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload } from "lucide-react";

/**
 * Frontend-only placeholder for attaching the customer-signed delivery ticket.
 * Only offered while the ticket is Delivered. Nothing is uploaded or persisted yet —
 * `onUploaded` is the hook where the future backend flow will store the file and
 * transition the ticket from Delivered to Closed.
 */
export function UploadSignedTicketButton({
  status, ticketNumber, variant = "icon", onUploaded,
}: {
  status: string;
  ticketNumber?: string | null;
  variant?: "icon" | "button";
  onUploaded?: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (status !== "delivered") return null;

  function confirm() {
    if (!file) return;
    // TODO(backend): upload the file, then set ticket status to "closed".
    onUploaded?.(file);
    toast.success(`"${file.name}" selected — upload isn't wired up yet`);
    setFile(null);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) setFile(null); }}
    >
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button size="icon" variant="ghost" aria-label="Upload signed ticket">
            <Upload className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline"><Upload className="mr-1 h-4 w-4" />Upload Signed Ticket</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload signed ticket {ticketNumber ?? ""}</DialogTitle>
          <DialogDescription>
            Attach the signed delivery ticket. Once this is connected to storage, the ticket will
            move from Delivered to Closed automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="signed-ticket-file">Signed ticket (PDF or image)</Label>
          <Input
            id="signed-ticket-file"
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? <p className="text-xs text-muted-foreground">{file.name}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!file} onClick={confirm}>Upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
