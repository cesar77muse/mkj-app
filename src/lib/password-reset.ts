// Password reset lives in two places — the sign-in page (locked out) and the
// user menu (signed in but forgot it) — so the redirect target and the
// "don't confirm whether the account exists" behaviour are defined once here.

import { supabase } from "@/integrations/supabase/client";

/** The route that handles a Supabase recovery link. */
export const PASSWORD_RESET_PATH = "/auth/reset";

/**
 * Where Supabase sends the user after it verifies the recovery token.
 *
 * This URL must be on the project's allow-list, or Supabase silently falls back
 * to the Site URL and the reset link lands on the dashboard instead of the reset
 * form: Dashboard → Authentication → URL Configuration → Redirect URLs.
 */
export function passwordResetRedirectUrl(): string {
  return `${window.location.origin}${PASSWORD_RESET_PATH}`;
}

/**
 * Sends the branded "Reset your password" email (supabase/templates/recovery.html).
 *
 * Resolves the same way whether or not an account exists — telling an anonymous
 * visitor which addresses are registered would turn the sign-in page into an
 * account-enumeration oracle. Supabase itself does not error on an unknown
 * address; this just makes the intent explicit so nobody "helpfully" adds a
 * "no such user" message later.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetRedirectUrl(),
  });
  // Rate limiting is the one failure worth surfacing — the user needs to know
  // to wait rather than assume the mail is coming.
  if (error) throw error;
}
