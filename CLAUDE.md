# CLAUDE.md

## Project Overview

This project is an application initially developed using Lovable.dev and synchronized through GitHub.

Lovable no longer manages any part of the app: the frontend and backend are fully owned in this repository (own Supabase project + Vercel hosting). Claude should help extend, improve, and maintain the application.

The project uses Supabase as the backend platform, including database, authentication, storage, and backend services where applicable.

---

# Development Philosophy

Prioritize clean, maintainable, production-ready code.

Before making significant architectural changes:
1. Explain the proposed approach.
2. Explain possible impacts.
3. Wait for confirmation before implementing large changes.

Prefer small, focused changes that are easy to review and revert.

---

# Role of Claude

Claude should primarily assist with:

- Backend development
- Database logic
- Supabase configuration
- Authentication flows
- API integrations
- Business logic
- Data processing
- Security improvements
- Performance optimization
- Debugging
- Code reviews
- Refactoring

---

# Frontend Guidelines

Avoid unnecessary modifications to frontend components, styling, or layouts unless explicitly requested.

When frontend changes are required:
- Preserve existing design patterns.
- Reuse existing components.
- Avoid rewriting large sections of UI code.

---

# Supabase Guidelines

Before modifying database-related functionality:

- Inspect the existing schema.
- Understand relationships between tables.
- Check existing Row Level Security (RLS) policies.
- Avoid destructive database changes without confirmation.

Prefer migrations or reversible changes.

---

# Authentication Guidelines

Treat authentication and user data as critical functionality.

Before modifying authentication:
- Review the existing authentication flow.
- Consider security implications.
- Preserve existing user sessions and permissions.

---

# Code Quality

When writing code:

- Follow the existing coding style.
- Avoid unnecessary dependencies.
- Prefer simple and maintainable solutions.
- Add comments only where they provide meaningful context.
- Explain complex logic.

---

# Git Workflow

Before making large changes:

Explain:
- Which files will change.
- Why the changes are needed.
- Possible side effects.

Do not make unrelated changes.

Keep commits focused and descriptive.

---

# Testing

Before suggesting completion of a feature:

- Verify the implementation.
- Identify possible edge cases.
- Explain how the change can be tested.

---

# Communication Style

When working on tasks:

1. First explain the plan.
2. Identify affected files.
3. Implement changes.
4. Summarize what changed.
5. Mention any recommended next steps.

Avoid assuming requirements that were not provided.
Ask questions when requirements are unclear.

---

# Purchase Orders and PO Requests

- Real POs belong to warehouse managers and admins. Project managers can view POs and receive shipments against them, but can't create, edit, delete, or change the status of one. This is enforced by RLS and `create_purchase_order`, not only by hidden buttons.
- Receiving recomputes a PO's status through the `refresh_po_status` RPC ([src/lib/receiving.ts](src/lib/receiving.ts)), never a direct UPDATE: managers have no UPDATE rights on `purchase_orders`, so a browser-side update would be silently dropped.
- Managers (their projects) and admins (any project) ask for POs with **Request a PO**: `po_requests` + `po_request_lines`, numbered `REQ-<project>-<seq>`. Pending → completed (warehouse/admin, optional free-text PO reference) or cancelled (reason required). A request is never linked to a PO row and never shows up in receiving, PDFs, or PO counts. Clients only SELECT these tables; every write goes through the `create/update/complete/cancel_po_request` RPCs, which also send the notifications.
- Procore tracking was removed entirely on 2026-09-12. Don't reintroduce `entered_in_procore`.

---

# Pending Decisions

- **Email confirmation on sign-up**: Supabase's "Confirm email" toggle (Dashboard → Authentication → Providers → Email) is active, and `signUp` in [src/routes/auth.tsx](src/routes/auth.tsx) assumes confirmation is required (shows a "check your email" toast). Staying that way. All five auth emails (confirm signup, reset password, magic link, invite, email change) are branded and generated from one layout — see [supabase/templates/README.md](supabase/templates/README.md).

- **Custom SMTP**: still outstanding, and the biggest launch blocker — worse than originally scoped. Confirmed directly from Supabase's own API: on the free tier, auth email templates can't be edited *at all* while the project is on the default mailer (`push_auth_email_templates.sh` fails with HTTP 400 until this is fixed), on top of the default mailer only delivering to addresses on the project's Team page and the ~2-3/hour rate limit. [`configure_smtp.sh`](supabase/maintenance/configure_smtp.sh) is built and tested (dry-run only, not yet run against the live project) to wire up Resend and fix all of it in one PATCH — needs a Resend account, an API key, and a verified sending domain. See [supabase/templates/README.md](supabase/templates/README.md#sending-limits-and-why-templates-may-refuse-to-push-at-all).

- **Supabase redirect allow-list**: the reset link only lands on `/auth/reset` if that URL is on the project's allow-list — Dashboard → Authentication → URL Configuration → Redirect URLs. `https://mkj-app.vercel.app/**` covers production; add `http://localhost:8080/**` for local testing. Without it Supabase silently falls back to the Site URL and the user lands on the dashboard instead of the reset form, with no error anywhere.

- **Invited users have no way to set a first password**: `/auth/reset` handles recovery links, but a Supabase invite drops the user on the app with a session and no password. Sending them to `/auth/reset` would work — the page only needs a session — but nothing routes them there yet.
