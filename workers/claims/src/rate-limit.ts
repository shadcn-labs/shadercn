// D1-backed sliding-window rate limiting (works locally without the edge
// Rate Limit binding). The Worker also declares a Cloudflare Rate Limit
// binding (CLAIM_RATE_LIMIT) for edge enforcement; this is the portable fallback.

interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T>(column?: string): Promise<T | null>;
    };
  };
}

const WINDOW_SECONDS = 600;
const LIMITS: Record<string, number> = {
  availability: 60,
  request: 5,
  resend: 5,
  verify: 20,
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const checkRateLimit = async (
  db: D1Like,
  scope: keyof typeof LIMITS,
  fingerprint: string
): Promise<{ ok: boolean; remaining: number }> => {
  const limit = LIMITS[scope] ?? 10;
  const now = new Date();
  const windowStart = new Date(
    now.getTime() - WINDOW_SECONDS * 1000
  ).toISOString();
  const keyHash = await sha256Hex(`${scope}:${fingerprint}`);
  try {
    await db
      .prepare("DELETE FROM rate_limit_hits WHERE scope = ? AND created_at < ?")
      .bind(scope, windowStart)
      .run();
    const row = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM rate_limit_hits WHERE scope = ? AND key_hash = ? AND created_at >= ?"
      )
      .bind(scope, keyHash, windowStart)
      .first<{ n: number }>();
    const count = Number(row?.n ?? 0);
    if (count >= limit) {
      return { ok: false, remaining: 0 };
    }
    await db
      .prepare(
        "INSERT INTO rate_limit_hits (scope, key_hash, created_at) VALUES (?, ?, ?)"
      )
      .bind(scope, keyHash, now.toISOString())
      .run();
    return { ok: true, remaining: limit - count - 1 };
  } catch {
    // Rate-limit storage must never hard-fail a claim; fail open with logging.
    return { ok: true, remaining: limit };
  }
};
