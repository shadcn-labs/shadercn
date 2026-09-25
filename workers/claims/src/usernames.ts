// Worker-side copy of the username contract (no Next.js alias imports so the
// Worker bundles standalone). Keep in sync with lib/claims/usernames.ts —
// scripts/verify-claims.mjs asserts parity on sample vectors.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const CLAIM_EXPIRY_MINUTES = 15;

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
];

const RESERVED_SET = new Set(RESERVED_USERNAMES);
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const HAS_ALNUM_PATTERN = /[a-z0-9]/;

export const canonicalizeUsername = (value: string): string =>
  value.trim().toLowerCase();

export const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase();

export const validateUsername = (
  canonical: string
): { ok: boolean; code?: string; message?: string } => {
  if (canonical.length < USERNAME_MIN_LENGTH) {
    return {
      code: "too_short",
      message: "Use at least 3 characters.",
      ok: false,
    };
  }
  if (canonical.length > USERNAME_MAX_LENGTH) {
    return {
      code: "too_long",
      message: "Keep it to 20 characters or fewer.",
      ok: false,
    };
  }
  if (!USERNAME_PATTERN.test(canonical)) {
    return {
      code: "invalid_chars",
      message: "Use 3–20 lowercase letters, numbers, or underscores.",
      ok: false,
    };
  }
  if (!HAS_ALNUM_PATTERN.test(canonical)) {
    return {
      code: "no_alnum",
      message: "Include at least one letter or number.",
      ok: false,
    };
  }
  if (canonical.startsWith("_") || canonical.endsWith("_")) {
    return {
      code: "leading_trailing_underscore",
      message: "Underscores can't start or end the name.",
      ok: false,
    };
  }
  if (canonical.includes("__")) {
    return {
      code: "consecutive_underscores",
      message: "Use single underscores only (no __).",
      ok: false,
    };
  }
  if (RESERVED_SET.has(canonical)) {
    return {
      code: "reserved",
      message: "That name is reserved. Try another.",
      ok: false,
    };
  }
  return { ok: true };
};

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
