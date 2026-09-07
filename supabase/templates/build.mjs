#!/usr/bin/env node
/**
 * Renders the Supabase auth email templates from _layout.html.
 *
 * GoTrue has no partials — each template is a standalone HTML string — so the
 * 180-line shell would otherwise be copy-pasted five times and drift the first
 * time someone changes the footer. This keeps the shell in one file and the
 * per-email copy in the table below.
 *
 *   node supabase/templates/build.mjs             # write the templates
 *   node supabase/templates/build.mjs --check     # fail if they are out of date (CI/pre-push)
 *   node supabase/templates/build.mjs --manifest  # keys + subjects as JSON, for the push script
 *
 * Anything inside {{ }} is a Go text/template action evaluated by GoTrue at send
 * time and is passed through untouched; the build placeholders are %%LIKE_THIS%%.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const LOGO_URL = "https://mkj-app.vercel.app/email-logo.png";
const APP_URL = "https://mkj-app.vercel.app";

// Supabase's mailer_otp_exp, in hours. push_auth_email_templates.sh checks this
// against the live project and warns if the dashboard says something else.
const EXPIRY_HOURS = 24;

const SIGN_IN_PANEL = panel(
  "After you confirm",
  `Sign in at <a href="${APP_URL}/auth" style="color: #16324d; text-decoration: underline;">mkj-app.vercel.app</a>.
   Your administrator assigns your role and projects, so some areas may stay hidden until that's done.`,
);

/**
 * One entry per Supabase auth email. `key` is both the output filename and the
 * Management API field stem (mailer_subjects_<key> / mailer_templates_<key>_content).
 */
export const EMAILS = [
  {
    key: "confirmation",
    label: "Confirm signup",
    subject: "Confirm your email address — MKJ Ops",
    preheader: "Confirm your email address to finish setting up your MKJ Ops account.",
    heading: "Confirm your email address",
    body: `An MKJ Ops account was created for <strong style="color: #0b1c2c;">{{ .Email }}</strong>.
           Confirm this address to activate the account and sign in to the operations dashboard.`,
    cta: "Confirm email address",
    ctaWidth: 245,
    panel: SIGN_IN_PANEL,
    disclaimer:
      "Didn't sign up for MKJ Ops? You can safely ignore this email — the account stays inactive until the address is confirmed.",
  },
  {
    key: "recovery",
    label: "Reset password",
    subject: "Reset your MKJ Ops password",
    preheader: "Use the link inside to choose a new MKJ Ops password.",
    heading: "Reset your password",
    body: `We received a request to reset the password for
           <strong style="color: #0b1c2c;">{{ .Email }}</strong>. Use the link below to choose a new one.
           Your current password stays active until you do.`,
    cta: "Reset password",
    ctaWidth: 195,
    panel: null,
    disclaimer:
      "Didn't ask to reset your password? You can safely ignore this email — your password only changes if you use the link above. If you get these repeatedly, tell your administrator.",
  },
  {
    key: "magic_link",
    label: "Magic link",
    subject: "Your MKJ Ops sign-in link",
    preheader: "Your one-time link to sign in to MKJ Ops.",
    heading: "Your sign-in link",
    body: `Use the link below to sign in to MKJ Ops as
           <strong style="color: #0b1c2c;">{{ .Email }}</strong>. No password needed.`,
    cta: "Sign in to MKJ Ops",
    ctaWidth: 219,
    panel: null,
    disclaimer:
      "Didn't request this link? You can safely ignore this email — nobody can sign in to your account without it.",
  },
  {
    key: "invite",
    label: "Invite user",
    subject: "You've been invited to MKJ Ops",
    preheader: "An administrator has invited you to the MKJ Ops operations dashboard.",
    heading: "You've been invited to MKJ Ops",
    body: `An administrator has invited <strong style="color: #0b1c2c;">{{ .Email }}</strong> to MKJ Ops —
           the system MKJ Communications uses to run purchase orders, inventory and shipping.
           Accept the invitation to set a password and get access.`,
    cta: "Accept invitation",
    ctaWidth: 201,
    panel: panel(
      "After you accept",
      `You'll be asked to set a password, then you're in at
       <a href="${APP_URL}/auth" style="color: #16324d; text-decoration: underline;">mkj-app.vercel.app</a>.
       Your administrator assigns your role and projects, so some areas may stay hidden until that's done.`,
    ),
    disclaimer:
      "Not expecting an invitation? You can safely ignore this email — no account is set up until you accept.",
  },
  {
    key: "email_change",
    label: "Change email address",
    subject: "Confirm your new email address — MKJ Ops",
    preheader: "Confirm the new address on your MKJ Ops account.",
    heading: "Confirm your new email address",
    body: `A request was made to change the email address on your MKJ Ops account from
           <strong style="color: #0b1c2c;">{{ .Email }}</strong> to
           <strong style="color: #0b1c2c;">{{ .NewEmail }}</strong>.
           Confirm it to finish the change — until then you keep signing in with the old address.`,
    cta: "Confirm new address",
    ctaWidth: 235,
    panel: null,
    // This one is a genuine account-takeover signal, so it gets full-contrast text
    // rather than the muted grey the other disclaimers use.
    disclaimerColor: "#0b1c2c",
    disclaimer:
      "<strong>Didn't request this change?</strong> Don't use the link, and tell your administrator straight away — someone else may have access to your account.",
  },
];

function panel(title, html) {
  return `
            <!-- What happens next. -->
            <tr>
              <td bgcolor="#ffffff" class="sm-px" style="background-color: #ffffff; padding: 0 48px 8px 48px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f9fc" style="background-color: #f6f9fc; border: 1px solid #d8dfe6; border-radius: 8px;">
                  <tr>
                    <td style="padding: 20px 24px; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      <p style="margin: 0 0 6px 0; font-size: 14px; line-height: 20px; font-weight: 600; color: #0b1c2c;">
                        ${title}
                      </p>
                      <p style="margin: 0; font-size: 14px; line-height: 22px; color: #576574;">
                        ${dedent(html)}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
`;
}

/** Collapse the indentation that template literals pick up from this file. */
function dedent(s) {
  return s.trim().replace(/\s*\n\s*/g, "\n                        ");
}

/**
 * Outlook's VML button cannot size to its text, so every email carries an explicit
 * ctaWidth. These were measured in a browser on the real anchor (16px semibold,
 * 32px padding each side) and rounded up by 8px of slack. A character-count
 * formula is not good enough here — the font is proportional, so "Reset password"
 * and "Accept invitation" are the same length and 6px apart — and a width that
 * is too small clips the label in Outlook. When you add or reword a CTA, measure
 * the rendered anchor and put the number here.
 */
function ctaWidth(email) {
  if (!email.ctaWidth) {
    throw new Error(
      `${email.key}: missing ctaWidth for CTA "${email.cta}" — measure the rendered button and add it`,
    );
  }
  return email.ctaWidth;
}

export function render(email) {
  const layout = readFileSync(join(DIR, "_layout.html"), "utf8");
  const out = layout
    .replaceAll("%%LOGO_URL%%", LOGO_URL)
    .replaceAll("%%PREHEADER%%", email.preheader)
    .replaceAll("%%HEADING%%", email.heading)
    .replaceAll("%%BODY%%", dedent(email.body))
    .replaceAll("%%CTA_LABEL%%", email.cta)
    .replaceAll("%%CTA_WIDTH%%", String(ctaWidth(email)))
    .replaceAll("%%EXPIRY_HOURS%%", String(EXPIRY_HOURS))
    .replaceAll("%%PANEL%%", email.panel ?? "")
    .replaceAll("%%DISCLAIMER_COLOR%%", email.disclaimerColor ?? "#7a8798")
    .replaceAll("%%DISCLAIMER%%", email.disclaimer);

  const leftover = out.match(/%%[A-Z_]+%%/g);
  if (leftover)
    throw new Error(`${email.key}: unreplaced placeholders ${[...new Set(leftover)].join(", ")}`);

  return `<!-- Generated by supabase/templates/build.mjs from _layout.html — do not edit directly. -->\n${out}`;
}

// The push script reads this so subjects live in exactly one place.
if (process.argv.includes("--manifest")) {
  console.log(
    JSON.stringify(
      {
        expiryHours: EXPIRY_HOURS,
        logoUrl: LOGO_URL,
        emails: EMAILS.map(({ key, label, subject }) => ({ key, label, subject })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const check = process.argv.includes("--check");
let stale = 0;

for (const email of EMAILS) {
  const path = join(DIR, `${email.key}.html`);
  const next = render(email);
  const current = (() => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  })();

  if (current === next) {
    console.log(`  ok       ${email.key}.html`);
  } else if (check) {
    console.log(`  STALE    ${email.key}.html`);
    stale++;
  } else {
    writeFileSync(path, next);
    console.log(`  ${current === null ? "created " : "updated "} ${email.key}.html`);
  }
}

if (check && stale) {
  console.error(`\n${stale} template(s) out of date — run: node supabase/templates/build.mjs`);
  process.exit(1);
}
