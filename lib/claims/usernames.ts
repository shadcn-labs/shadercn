/**
 * Shared username contract for the orb-claim flow.
 *
 * Pure functions only — safe to import from Next.js (server + client) and
 * from the Cloudflare Worker. Server-side D1 uniqueness remains the authority;
 * these helpers keep client validation in agreement with it.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const CLAIM_EXPIRY_MINUTES = 15;

/**
 * Names that must never become public identities. Covers existing top-level
 * routes, API/docs surfaces, and operational names. Keep sorted.
 */
export const RESERVED_USERNAMES = [
  "_next",
  "about",
  "account",
  "admin",
  "api",
  "assets",
  "auth",
  "billing",
  "blog",
  "cdn",
  "claim",
  "claims",
  "components",
  "contact",
  "dashboard",
  "developers",
  "docs",
  "download",
  "downloads",
  "email",
  "favicon",
  "feed",
  "health",
  "help",
  "home",
  "images",
  "index",
  "login",
  "logout",
  "mail",
  "manifest",
  "marketing",
  "mcp",
  "newsletter",
  "notifications",
  "oauth",
  "openapi",
  "orb",
  "orbs",
  "playground",
  "privacy",
  "public",
  "r",
  "registry",
  "robots",
  "root",
  "rss",
  "search",
  "security",
  "settings",
  "shader",
  "shadercn",
  "shaders",
  "signin",
  "signup",
  "sitemap",
  "sponsor",
  "static",
  "status",
  "support",
  "terms",
  "u",
  "user",
  "users",
  "username",
  "verify",
  "webhook",
  "webhooks",
  "well-known",
  "ws",
  "www",
] as const;

const RESERVED_SET = new Set<string>(RESERVED_USERNAMES);

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const HAS_ALNUM_PATTERN = /[a-z0-9]/;

/** Canonical form: trimmed + lowercased. The D1 unique constraint uses this. */
export const canonicalizeUsername = (value: string): string =>
  value.trim().toLowerCase();

/** Normalized email for private storage + hashing. Never expose publicly. */
export const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase();

export type UsernameErrorCode =
  | "too_short"
  | "too_long"
  | "invalid_chars"
  | "no_alnum"
  | "leading_trailing_underscore"
  | "consecutive_underscores"
  | "reserved";

export interface UsernameValidation {
  ok: boolean;
  code?: UsernameErrorCode;
  message?: string;
}

const MESSAGES: Record<UsernameErrorCode, string> = {
  consecutive_underscores: "Use single underscores only (no __).",
  invalid_chars: "Use 3–20 lowercase letters, numbers, or underscores.",
  leading_trailing_underscore: "Underscores can't start or end the name.",
  no_alnum: "Include at least one letter or number.",
  reserved: "That name is reserved. Try another.",
  too_long: "Keep it to 20 characters or fewer.",
  too_short: "Use at least 3 characters.",
};

export const validateUsername = (canonical: string): UsernameValidation => {
  if (canonical.length < USERNAME_MIN_LENGTH) {
    return { code: "too_short", message: MESSAGES.too_short, ok: false };
  }
  if (canonical.length > USERNAME_MAX_LENGTH) {
    return { code: "too_long", message: MESSAGES.too_long, ok: false };
  }
  if (!USERNAME_PATTERN.test(canonical)) {
    return {
      code: "invalid_chars",
      message: MESSAGES.invalid_chars,
      ok: false,
    };
  }
  if (!HAS_ALNUM_PATTERN.test(canonical)) {
    return { code: "no_alnum", message: MESSAGES.no_alnum, ok: false };
  }
  if (canonical.startsWith("_") || canonical.endsWith("_")) {
    return {
      code: "leading_trailing_underscore",
      message: MESSAGES.leading_trailing_underscore,
      ok: false,
    };
  }
  if (canonical.includes("__")) {
    return {
      code: "consecutive_underscores",
      message: MESSAGES.consecutive_underscores,
      ok: false,
    };
  }
  if (RESERVED_SET.has(canonical)) {
    return { code: "reserved", message: MESSAGES.reserved, ok: false };
  }
  return { ok: true };
};

/** Validate raw user input (canonicalizes first). */
export const validateUsernameInput = (raw: string): UsernameValidation =>
  validateUsername(canonicalizeUsername(raw));

export const isReservedUsername = (canonical: string): boolean =>
  RESERVED_SET.has(canonical);

/** Very small email sanity check — the Worker applies the same rule. */
export const isValidEmail = (value: string): boolean => {
  const email = value.trim();
  if (email.length < 3 || email.length > 254 || email.includes(" ")) {
    return false;
  }
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@") || at === email.length - 1) {
    return false;
  }
  const domain = email.slice(at + 1);
  return (
    domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".")
  );
};

/** Mask an address for "Check your inbox" confirmations: j***@example.com */
export const maskEmail = (email: string): string => {
  const normalized = email.trim();
  const at = normalized.indexOf("@");
  if (at <= 0 || at === normalized.length - 1) {
    return "***";
  }
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
};

/** Public profile path for a canonical username. */
export const profilePathFor = (canonical: string): string => `/@${canonical}`;
