import { Check, X } from "lucide-react";
import { evaluatePassword, PASSWORD_RULES } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

/**
 * Renders the app-wide password requirements. When `value` is provided each
 * rule shows live pass/fail state; otherwise it is plain helper text.
 */
export function PasswordRequirements({ value, className }: { value?: string; className?: string }) {
  if (value === undefined) {
    return (
      <ul className={cn("space-y-0.5 text-xs text-muted-foreground", className)}>
        {PASSWORD_RULES.map((r) => (
          <li key={r.id}>• {r.label}</li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={cn("space-y-0.5 text-xs", className)}>
      {evaluatePassword(value).map((r) => (
        <li
          key={r.id}
          className={cn("flex items-center gap-1.5", r.passed ? "text-primary" : "text-muted-foreground")}
        >
          {r.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {r.label}
        </li>
      ))}
    </ul>
  );
}
