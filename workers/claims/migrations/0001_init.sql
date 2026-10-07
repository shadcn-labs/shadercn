-- Claims + verification-token state for the username-claim flow.
-- D1 uniqueness is the authority: concurrent inserts for the same canonical
-- username cannot both succeed. Expired pending rows are deleted before insert
-- so they stop blocking the name.

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  display_username TEXT NOT NULL,
  -- Private. Never returned by public endpoints or written to logs.
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified')),
  orb_seed INTEGER,
  generator_version INTEGER,
  variant_slug TEXT,
  config_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT
);

-- Canonical usernames are unique across pending + verified. Availability checks
-- ignore expired pending rows; the request path deletes them transactionally
-- before inserting so expiry unblocks the name.
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_username ON claims (username);

-- One verified username per normalized email. Pending rows are not constrained
-- so retries/resends never leak whether an address already owns a claim.
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_verified_email
  ON claims (email_hash) WHERE status = 'verified';

CREATE INDEX IF NOT EXISTS idx_claims_status_expires
  ON claims (status, expires_at);

CREATE TABLE IF NOT EXISTS verification_tokens (
  token_hash TEXT PRIMARY KEY,
  claim_id INTEGER NOT NULL REFERENCES claims (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  superseded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tokens_claim
  ON verification_tokens (claim_id, created_at DESC);

-- Abuse-control sliding window (privacy-preserving: hashes only).
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_scope_time
  ON rate_limit_hits (scope, created_at);
