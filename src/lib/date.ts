const BUSINESS_TIMEZONE = "America/New_York";

/**
 * Today's date (YYYY-MM-DD) in the business's timezone, not the browser's.
 * `new Date().toISOString().slice(0, 10)` reads the UTC calendar date — after
 * 8pm ET that's already tomorrow. The PDF functions already render dates in
 * America/New_York; this keeps stored/defaulted dates agreeing with them.
 */
export function todayInBusinessTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(new Date());
}

/** `days` days before now (YYYY-MM-DD), in the business's timezone. */
export function daysAgoInBusinessTimezone(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(new Date(Date.now() - days * 864e5));
}
