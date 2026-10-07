/**
 * shadercn-claims Worker: username-claim API on Cloudflare.
 *
 * Routes (mounted under /api/claims by the Next.js proxy):
 * - GET  /api/claims/availability?username=...
 * - POST /api/claims/request   { username, email, turnstileToken }
 * - POST /api/claims/resend    { username, email }
 * - GET  /api/claims/verify?token=...
 * - GET  /api/claims/<username>  (public orb data only)
 *
 * Invariants:
 * - D1 uniqueness is the authority for usernames + verified emails.
 * - Raw emails/tokens never appear in logs or public responses.
 * - Email failures never report success and never permanently lock a name
 *   (pending rows expire after 15 minutes).
 */

import {
  confirmationHtml,
  confirmationSubject,
  confirmationText,
  buildVerifyUrl,
} from "./email";
import { generateOrbForUsername } from "./orbs";
import { checkRateLimit, sha256Hex } from "./rate-limit";
import {
  CLAIM_EXPIRY_MINUTES,
  canonicalizeUsername,
  isValidEmail,
  normalizeEmail,
  validateUsername,
} from "./usernames";

interface D1BoundStatement {
  first<T>(column?: string): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

interface D1Prepared {
  bind(...values: unknown[]): D1BoundStatement;
}

interface D1Database {
  prepare(query: string): D1Prepared;
  batch(statements: D1BoundStatement[]): Promise<unknown[]>;
}

interface EmailBinding {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId: string }>;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  DB: D1Database;
  EMAIL: EmailBinding;
  CLAIM_RATE_LIMIT?: RateLimitBinding;
  CLAIMS_FROM_EMAIL?: string;
  CLAIMS_SITE_URL?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_ACTION?: string;
  ALLOWED_HOSTNAMES?: string;
}

interface ClaimRow {
  id: number;
  username: string;
  display_username: string;
  status: string;
  orb_seed: number | null;
  generator_version: number | null;
  variant_slug: string | null;
  config_json: string | null;
  created_at: string;
  expires_at: string;
  verified_at: string | null;
  email_hash: string;
}

interface TokenRow {
  token_hash: string;
  claim_id: number;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  superseded_at: string | null;
}

const MAX_BODY_BYTES = 8192;
const TOKEN_BYTES = 32;

const nowIso = (date = new Date()): string => date.toISOString();
const expiryIso = (minutes = CLAIM_EXPIRY_MINUTES): string =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const json = (data: unknown, status = 200): Response =>
  Response.json(data, {
    headers: { "Cache-Control": "no-store" },
    status,
  });

const errorJson = (
  code: string,
  status = 400,
  extra?: Record<string, unknown>
): Response => json({ code, ok: false, ...extra }, status);

const clientIp = (request: Request): string =>
  request.headers.get("CF-Connecting-IP") ??
  request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
  "unknown";

const allowedHostnames = (env: Env): Set<string> => {
  const hosts = new Set<string>();
  const site = env.CLAIMS_SITE_URL ?? "";
  try {
    if (site) {
      hosts.add(new URL(site).hostname);
    }
  } catch {
    // ignore malformed site URL; requests still validated by Origin below
  }
  for (const part of (env.ALLOWED_HOSTNAMES ?? "").split(",")) {
    const host = part.trim().toLowerCase();
    if (host) {
      hosts.add(host);
    }
  }
  hosts.add("localhost");
  hosts.add("127.0.0.1");
  return hosts;
};

const checkOrigin = (request: Request, env: Env): boolean => {
  if (request.method === "GET") {
    return true;
  }
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  const hosts = allowedHostnames(env);
  if (origin) {
    try {
      return hosts.has(new URL(origin).hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      return hosts.has(new URL(referer).hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  return true;
};

const checkContentType = (request: Request): boolean => {
  if (request.method === "GET") {
    return true;
  }
  const contentType = request.headers.get("Content-Type") ?? "";
  return contentType.includes("application/json");
};

const readJsonBody = async <T>(request: Request): Promise<T | null> => {
  const declared = request.headers.get("Content-Length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return null;
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const newRawToken = (): string =>
  base64UrlEncode(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));

const isPlausibleToken = (token: string): boolean =>
  /^[A-Za-z0-9_-]{20,128}$/.test(token);

const edgeRateLimit = async (env: Env, key: string): Promise<boolean> => {
  if (!env.CLAIM_RATE_LIMIT) {
    return true;
  }
  try {
    const result = await env.CLAIM_RATE_LIMIT.limit({ key });
    return result.success;
  } catch {
    return true;
  }
};

const verifyTurnstile = async (
  env: Env,
  token: string,
  ip: string
): Promise<boolean> => {
  const secret = env.TURNSTILE_SECRET ?? "";
  if (!secret) {
    // Misconfigured server: fail closed without leaking details.
    return false;
  }
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        body: new URLSearchParams({ remoteip: ip, response: token, secret }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      return false;
    }
    const result = (await response.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
      ["error-codes"]?: string[];
    };
    if (result.success !== true) {
      // Error codes are non-sensitive (e.g. timeout-or-duplicate) and never
      // include the token or secret.
      console.log(
        JSON.stringify({
          codes: result["error-codes"] ?? [],
          event: "turnstile_rejected",
        })
      );
      return false;
    }
    const expectedAction = env.TURNSTILE_ACTION ?? "claim";
    if (expectedAction && result.action && result.action !== expectedAction) {
      return false;
    }
    if (result.hostname) {
      const hosts = allowedHostnames(env);
      // Local/dev hostnames are always permitted; production allowlist enforced
      // when ALLOWED_HOSTNAMES is configured explicitly.
      if (!hosts.has(result.hostname.toLowerCase())) {
        // Hostname is our own domain or the test harness value — safe to log.
        console.log(
          JSON.stringify({
            event: "turnstile_hostname",
            hostname: result.hostname,
          })
        );
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

const maskForLog = (hash: string): string => hash.slice(0, 8);

const getClaimByUsername = async (
  db: D1Database,
  username: string
): Promise<ClaimRow | null> => {
  const row = await db
    .prepare("SELECT * FROM claims WHERE username = ? LIMIT 1")
    .bind(username)
    .first<ClaimRow>();
  return row ?? null;
};

const deleteExpiredPending = async (
  db: D1Database,
  now: string
): Promise<void> => {
  try {
    await db
      .prepare(
        "DELETE FROM verification_tokens WHERE expires_at <= ? AND consumed_at IS NULL"
      )
      .bind(now)
      .run();
    await db
      .prepare(
        "DELETE FROM claims WHERE status = 'pending' AND expires_at <= ?"
      )
      .bind(now)
      .run();
  } catch {
    // Expiry cleanup is best-effort; availability logic also filters by time.
  }
};

const isExpired = (iso: string, now: string): boolean => iso <= now;

/** Availability: advisory only. D1 unique constraint decides at request time. */
const handleAvailability = async (
  request: Request,
  env: Env
): Promise<Response> => {
  const url = new URL(request.url);
  const raw = url.searchParams.get("username") ?? "";
  const canonical = canonicalizeUsername(raw);
  const validation = validateUsername(canonical);
  if (!validation.ok) {
    return json({ available: false, code: validation.code, ok: true });
  }
  const ip = clientIp(request);
  if (!(await edgeRateLimit(env, `availability:${ip}`))) {
    return errorJson("rate_limited", 429);
  }
  const rate = await checkRateLimit(env.DB, "availability", ip);
  if (!rate.ok) {
    return errorJson("rate_limited", 429);
  }
  const now = nowIso();
  await deleteExpiredPending(env.DB, now);
  const existing = await getClaimByUsername(env.DB, canonical);
  if (!existing) {
    return json({ available: true, ok: true });
  }
  if (existing.status === "verified" || !isExpired(existing.expires_at, now)) {
    return json({ available: false, code: "taken", ok: true });
  }
  return json({ available: true, ok: true });
};

interface RequestBody {
  username?: unknown;
  email?: unknown;
  turnstileToken?: unknown;
}

interface ParsedClaimInput {
  canonical: string;
  display: string;
  emailHash: string;
  normalized: string;
  turnstileToken: string;
}

const parseClaimInput = async (
  body: RequestBody
): Promise<{ error: string; status: number } | { input: ParsedClaimInput }> => {
  if (typeof body.username !== "string" || typeof body.email !== "string") {
    return { error: "invalid_request", status: 400 };
  }
  const turnstileToken =
    typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  if (!turnstileToken || turnstileToken.length > 2048) {
    return { error: "turnstile_required", status: 403 };
  }
  const canonical = canonicalizeUsername(body.username);
  const validation = validateUsername(canonical);
  if (!validation.ok) {
    return { error: validation.code ?? "invalid_username", status: 400 };
  }
  const email = body.email.trim();
  if (!isValidEmail(email)) {
    return { error: "invalid_email", status: 400 };
  }
  const normalized = normalizeEmail(email);
  const emailHash = await sha256Hex(`email:${normalized}`);
  return {
    input: {
      canonical,
      display: body.username.trim(),
      emailHash,
      normalized,
      turnstileToken,
    },
  };
};

const enforceRequestRateLimit = async (
  env: Env,
  fingerprint: string
): Promise<boolean> => {
  if (!(await edgeRateLimit(env, `request:${fingerprint.slice(0, 32)}`))) {
    return false;
  }
  const rate = await checkRateLimit(env.DB, "request", fingerprint);
  return rate.ok;
};

/** Generic recovery: the API never discloses email ownership. */
const sendRecoveryMail = async (
  env: Env,
  normalized: string,
  emailHash: string,
  existingUsername: string
): Promise<void> => {
  console.log(
    JSON.stringify({
      event: "claim_recovery",
      user: maskForLog(emailHash),
    })
  );
  try {
    const siteUrl = env.CLAIMS_SITE_URL ?? "https://shadercn.run";
    await env.EMAIL.send({
      from: env.CLAIMS_FROM_EMAIL ?? "noreply@example.com",
      html: `<div style="font-family:system-ui,sans-serif"><p>You already claimed <a href="${siteUrl}/@${existingUsername}">@${existingUsername}</a>.</p></div>`,
      subject: "Your shadercn orb is already claimed",
      text: `You already claimed @${existingUsername}: ${siteUrl}/@${existingUsername}`,
      to: normalized,
    });
  } catch {
    // Recovery mail is best-effort; the API response stays generic.
  }
};

const insertPendingClaim = async (
  env: Env,
  input: ParsedClaimInput,
  now: string
): Promise<ClaimRow | null> => {
  const expiresAt = expiryIso();
  try {
    await env.DB.prepare(
      "INSERT INTO claims (username, display_username, email, email_hash, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)"
    )
      .bind(
        input.canonical,
        input.display,
        input.normalized,
        input.emailHash,
        now,
        expiresAt
      )
      .run();
  } catch {
    return null;
  }
  return getClaimByUsername(env.DB, input.canonical);
};

const issueTokenAndMail = async (
  env: Env,
  claim: ClaimRow,
  input: ParsedClaimInput,
  now: string
): Promise<"sent" | "email_failed" | "unavailable"> => {
  const rawToken = newRawToken();
  const tokenHash = await sha256Hex(`token:${rawToken}`);
  try {
    await env.DB.prepare(
      "INSERT INTO verification_tokens (token_hash, claim_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
    )
      .bind(tokenHash, claim.id, now, claim.expires_at)
      .run();
  } catch {
    return "unavailable";
  }
  const siteUrl = env.CLAIMS_SITE_URL ?? "https://shadercn.run";
  try {
    await env.EMAIL.send({
      from: env.CLAIMS_FROM_EMAIL ?? "noreply@example.com",
      html: confirmationHtml(
        input.canonical,
        buildVerifyUrl(siteUrl, rawToken)
      ),
      subject: confirmationSubject(input.canonical),
      text: confirmationText(
        input.canonical,
        buildVerifyUrl(siteUrl, rawToken)
      ),
      to: input.normalized,
    });
  } catch {
    console.log(
      JSON.stringify({
        event: "email_failed",
        user: maskForLog(input.emailHash),
      })
    );
    // Do not report success; the pending row expires and resend can retry.
    return "email_failed";
  }
  console.log(
    JSON.stringify({
      event: "claim_requested",
      user: maskForLog(input.emailHash),
    })
  );
  return "sent";
};

const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  if (!checkOrigin(request, env) || !checkContentType(request)) {
    return errorJson("forbidden", 403);
  }
  const body = await readJsonBody<RequestBody>(request);
  if (!body) {
    return errorJson("invalid_request", 400);
  }
  const parsed = await parseClaimInput(body);
  if ("error" in parsed) {
    return errorJson(parsed.error, parsed.status);
  }
  const { input } = parsed;
  const ip = clientIp(request);
  const fingerprint = await sha256Hex(
    `${ip}:${input.canonical}:${input.emailHash}`
  );
  if (!(await enforceRequestRateLimit(env, fingerprint))) {
    return errorJson("rate_limited", 429);
  }
  if (!(await verifyTurnstile(env, input.turnstileToken, ip))) {
    return errorJson("turnstile_failed", 403);
  }

  const now = nowIso();
  await deleteExpiredPending(env.DB, now);

  const existingVerified = await env.DB.prepare(
    "SELECT id, username FROM claims WHERE email_hash = ? AND status = 'verified' LIMIT 1"
  )
    .bind(input.emailHash)
    .first<{ id: number; username: string }>();
  if (existingVerified) {
    await sendRecoveryMail(
      env,
      input.normalized,
      input.emailHash,
      existingVerified.username
    );
    return json({ ok: true, status: "pending" });
  }

  const claim = await insertPendingClaim(env, input, now);
  if (!claim) {
    return errorJson("unavailable", 409);
  }
  const outcome = await issueTokenAndMail(env, claim, input, now);
  if (outcome === "sent") {
    return json({ ok: true, status: "pending" });
  }
  return errorJson(outcome, outcome === "email_failed" ? 502 : 409);
};

interface ResendBody {
  username?: unknown;
  email?: unknown;
}

const handleResend = async (request: Request, env: Env): Promise<Response> => {
  if (!checkOrigin(request, env) || !checkContentType(request)) {
    return errorJson("forbidden", 403);
  }
  const body = await readJsonBody<ResendBody>(request);
  // Always generic: missing/invalid input still returns ok to avoid probing.
  if (
    !body ||
    typeof body.username !== "string" ||
    typeof body.email !== "string"
  ) {
    return json({ ok: true, status: "pending" });
  }
  const canonical = canonicalizeUsername(body.username);
  if (!validateUsername(canonical).ok || !isValidEmail(body.email)) {
    return json({ ok: true, status: "pending" });
  }
  const normalized = normalizeEmail(body.email);
  const emailHash = await sha256Hex(`email:${normalized}`);
  const ip = clientIp(request);
  const fingerprint = await sha256Hex(`${ip}:${canonical}:${emailHash}`);
  if (!(await edgeRateLimit(env, `resend:${fingerprint.slice(0, 32)}`))) {
    return errorJson("rate_limited", 429);
  }
  const rate = await checkRateLimit(env.DB, "resend", fingerprint);
  if (!rate.ok) {
    return errorJson("rate_limited", 429);
  }
  const now = nowIso();
  await deleteExpiredPending(env.DB, now);
  const claim = await env.DB.prepare(
    "SELECT * FROM claims WHERE username = ? AND email_hash = ? AND status = 'pending' LIMIT 1"
  )
    .bind(canonical, emailHash)
    .first<ClaimRow>();
  if (!claim || isExpired(claim.expires_at, now)) {
    return json({ ok: true, status: "pending" });
  }
  // Supersede older links, then issue a fresh single-use token.
  const createdAt = now;
  const expiresAt = claim.expires_at;
  const rawToken = newRawToken();
  const tokenHash = await sha256Hex(`token:${rawToken}`);
  try {
    await env.DB.prepare(
      "UPDATE verification_tokens SET superseded_at = ? WHERE claim_id = ? AND consumed_at IS NULL AND superseded_at IS NULL"
    )
      .bind(createdAt, claim.id)
      .run();
    await env.DB.prepare(
      "INSERT INTO verification_tokens (token_hash, claim_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
    )
      .bind(tokenHash, claim.id, createdAt, expiresAt)
      .run();
  } catch {
    return json({ ok: true, status: "pending" });
  }
  const siteUrl = env.CLAIMS_SITE_URL ?? "https://shadercn.run";
  try {
    await env.EMAIL.send({
      from: env.CLAIMS_FROM_EMAIL ?? "noreply@example.com",
      html: confirmationHtml(canonical, buildVerifyUrl(siteUrl, rawToken)),
      subject: confirmationSubject(canonical),
      text: confirmationText(canonical, buildVerifyUrl(siteUrl, rawToken)),
      to: normalized,
    });
  } catch {
    console.log(
      JSON.stringify({ event: "email_failed", user: maskForLog(emailHash) })
    );
    return errorJson("email_failed", 502);
  }
  return json({ ok: true, status: "pending" });
};

const handleVerify = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token") ?? "";
  if (!isPlausibleToken(rawToken)) {
    return errorJson("malformed", 400);
  }
  const ip = clientIp(request);
  if (!(await edgeRateLimit(env, `verify:${ip}`))) {
    return errorJson("rate_limited", 429);
  }
  const rate = await checkRateLimit(env.DB, "verify", ip);
  if (!rate.ok) {
    return errorJson("rate_limited", 429);
  }
  const tokenHash = await sha256Hex(`token:${rawToken}`);
  const now = nowIso();
  const token = await env.DB.prepare(
    "SELECT * FROM verification_tokens WHERE token_hash = ? LIMIT 1"
  )
    .bind(tokenHash)
    .first<TokenRow>();
  if (!token) {
    return errorJson("invalid", 404);
  }
  if (token.consumed_at) {
    return errorJson("already_used", 410);
  }
  if (token.superseded_at) {
    return errorJson("superseded", 410);
  }
  if (isExpired(token.expires_at, now)) {
    return errorJson("expired", 410);
  }
  const claim = await env.DB.prepare(
    "SELECT * FROM claims WHERE id = ? LIMIT 1"
  )
    .bind(token.claim_id)
    .first<ClaimRow>();
  if (!claim) {
    return errorJson("invalid", 404);
  }
  if (claim.status === "verified") {
    return errorJson("already_used", 410);
  }
  if (isExpired(claim.expires_at, now)) {
    return errorJson("expired", 410);
  }

  // Deterministic, versioned orb finalized once at verify time.
  const orb = generateOrbForUsername(claim.username);
  const verifiedAt = now;
  try {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE verification_tokens SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL"
      ).bind(verifiedAt, tokenHash),
      env.DB.prepare(
        "UPDATE claims SET status = 'verified', orb_seed = ?, generator_version = ?, variant_slug = ?, config_json = ?, verified_at = ? WHERE id = ? AND status = 'pending'"
      ).bind(
        orb.seed,
        orb.version,
        orb.slug,
        JSON.stringify(orb),
        verifiedAt,
        claim.id
      ),
    ]);
  } catch {
    // Verified-email uniqueness conflict: generic recovery, no disclosure.
    return errorJson("recovery", 409);
  }
  const updated = await env.DB.prepare(
    "SELECT * FROM claims WHERE id = ? LIMIT 1"
  )
    .bind(claim.id)
    .first<ClaimRow>();
  if (!updated || updated.status !== "verified") {
    // Lost the race (replay or concurrent verify): explicit recovery state.
    return errorJson("already_used", 410);
  }
  // Best-effort: mark sibling tokens superseded so only the consumed link reads as used.
  try {
    await env.DB.prepare(
      "UPDATE verification_tokens SET superseded_at = ? WHERE claim_id = ? AND token_hash != ? AND consumed_at IS NULL AND superseded_at IS NULL"
    )
      .bind(verifiedAt, claim.id, tokenHash)
      .run();
  } catch {
    // ignore
  }
  console.log(
    JSON.stringify({ claim: claim.username, event: "claim_verified" })
  );
  return json({
    config: orb,
    generator_version: orb.version,
    ok: true,
    seed: orb.seed,
    username: claim.username,
    variant_slug: orb.slug,
    verified_at: verifiedAt,
  });
};

const handlePublicGet = async (
  username: string,
  env: Env
): Promise<Response> => {
  const canonical = canonicalizeUsername(username);
  if (!validateUsername(canonical).ok) {
    return errorJson("not_found", 404);
  }
  const claim = await getClaimByUsername(env.DB, canonical);
  if (!claim || claim.status !== "verified" || !claim.config_json) {
    return errorJson("not_found", 404);
  }
  let config: unknown = null;
  try {
    config = JSON.parse(claim.config_json);
  } catch {
    return errorJson("not_found", 404);
  }
  return json(
    {
      config,
      generator_version: claim.generator_version,
      ok: true,
      seed: claim.orb_seed,
      username: claim.username,
      variant_slug: claim.variant_slug,
      verified_at: claim.verified_at,
    },
    200
  );
};

const router = (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/api/claims/availability" && request.method === "GET") {
    return handleAvailability(request, env);
  }
  if (path === "/api/claims/request" && request.method === "POST") {
    return handleRequest(request, env);
  }
  if (path === "/api/claims/resend" && request.method === "POST") {
    return handleResend(request, env);
  }
  if (path === "/api/claims/verify" && request.method === "GET") {
    return handleVerify(request, env);
  }
  const publicMatch = path.match(/^\/api\/claims\/([^/]+)$/);
  if (publicMatch && request.method === "GET") {
    return handlePublicGet(decodeURIComponent(publicMatch[1]), env);
  }
  if (path === "/" || path === "/api/claims") {
    return Promise.resolve(json({ ok: true, service: "shadercn-claims" }));
  }
  return Promise.resolve(errorJson("not_found", 404));
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return router(request, env).catch(() => errorJson("internal", 500));
  },
};
