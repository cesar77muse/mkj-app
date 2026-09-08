import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendPasswordResetEmail } from "@/lib/password-reset";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The signed-in user's address. When set the dialog just confirms; when
   * omitted (the sign-in page, where there is no session) it asks for one.
   */
  fixedEmail?: string | null;
  /** Prefill for the editable variant — whatever was already typed on the form. */
  defaultEmail?: string;
};

export function RequestPasswordResetDialog({
  open,
  onOpenChange,
  fixedEmail,
  defaultEmail = "",
}: Props) {
  const [email, setEmail] = useState(defaultEmail);

  // Pick up what the user has typed into the sign-in form since last time.
  useEffect(() => {
    if (open && !fixedEmail) setEmail(defaultEmail);
  }, [open, fixedEmail, defaultEmail]);

  const address = fixedEmail ?? email;

  const sendMut = useMutation({
    mutationFn: () => sendPasswordResetEmail(address),
    onSuccess: () => {
      onOpenChange(false);
      // Deliberately does not confirm whether the address has an account.
      toast.success("If that address has an account, a reset link is on its way.", {
        description: "The link is valid for 24 hours. Check spam if it doesn't arrive.",
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not send the reset email."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (address.trim()) sendMut.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              {fixedEmail
                ? `We'll email a link to ${fixedEmail}. Follow it to choose a new password.`
                : "Enter the email address on your account and we'll send you a link to choose a new password."}
            </DialogDescription>
          </DialogHeader>

          {fixedEmail ? null : (
            <div className="space-y-2 py-4">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          <DialogFooter className={fixedEmail ? "pt-4" : undefined}>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!address.trim() || sendMut.isPending}>
              {sendMut.isPending ? "Sending…" : "Send reset link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
