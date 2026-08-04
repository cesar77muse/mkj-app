// Single source of truth for password rules. Any UI that shows password
// helper text or validates a password should read from here so the rules
// never drift apart between screens.

export type PasswordRule = {
  id: string;
  label: string;
  test: (value: string) => boolean;
};

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  { id: "uppercase", label: "At least one uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lowercase", label: "At least one lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "number", label: "At least one number", test: (v) => /\d/.test(v) },
  {
    id: "special",
    label: "At least one special character (e.g. !@#$%)",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

export function evaluatePassword(value: string) {
  return PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(value) }));
}

export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

export function firstPasswordError(value: string): string | null {
  return PASSWORD_RULES.find((rule) => !rule.test(value))?.label ?? null;
}
