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