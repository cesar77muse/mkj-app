# CLAUDE.md

## Project Overview

This project is an application initially developed using Lovable.dev and synchronized through GitHub.

The frontend is primarily generated and maintained through Lovable. Claude should help extend, improve, and maintain the application while preserving compatibility with Lovable's workflow.

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

The frontend is primarily managed through Lovable.

Avoid unnecessary modifications to frontend components, styling, or layouts unless explicitly requested.

When frontend changes are required:
- Preserve existing design patterns.
- Reuse existing components.
- Avoid rewriting large sections of UI code.
- Maintain compatibility with Lovable-generated code.

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

# Pending Decisions

- **Email confirmation on sign-up**: Supabase's "Confirm email" toggle (Dashboard → Authentication → Providers → Email) is active, and `signUp` in [src/routes/auth.tsx](src/routes/auth.tsx) assumes confirmation is required (shows a "check your email" toast). Staying that way. All five auth emails (confirm signup, reset password, magic link, invite, email change) are branded and generated from one layout — see [supabase/templates/README.md](supabase/templates/README.md).

- **Custom SMTP**: still outstanding, and the biggest launch blocker. Supabase's built-in sender is rate-limited to roughly 2-3 messages an hour, which is fine for testing and not for onboarding a team. Needs an account with Resend or Postmark, a verified sending domain, and the SMTP credentials set in Dashboard → Authentication → Emails → SMTP Settings. Until that is done, several people registering in the same hour will silently not receive their confirmation email.

- **No password-reset route**: `recovery.html` is branded and an admin can send a reset from the Supabase Dashboard, but the app has no page that handles the link. The user lands on the dashboard signed in, and Account Settings requires the *current* password to set a new one — which someone who forgot it doesn't have. Needs an `/auth/reset` route that reads the recovery session and calls `updateUser({ password })`. The same gap blocks the invite flow, where the user has no password yet. See [supabase/templates/README.md](supabase/templates/README.md).