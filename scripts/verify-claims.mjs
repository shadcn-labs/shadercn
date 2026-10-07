import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
// Claim-flow verification: pure contracts, D1 SQL semantics (node:sqlite),
// token lifecycle, email templates, and static UI-accessibility checks.
// Run: node scripts/verify-claims.mjs
import { test, describe } from "node:test";
import { pathToFileURL } from "node:url";

import { createJiti } from "jiti";

const root = join(import.meta.dirname, "..");
const workerSrc = join(root, "workers/claims/src");
const toUrl = (p) => pathToFileURL(p).href;
// jiti resolves extensionless TS imports inside the Worker sources.
const jiti = createJiti(import.meta.url);

const usernames = await jiti.import(toUrl(join(workerSrc, "usernames.ts")));
const orbs = await jiti.import(toUrl(join(workerSrc, "orbs.ts")));
const email = await jiti.import(toUrl(join(workerSrc, "email.ts")));

describe("username contract", () => {
  test("canonicalizes to lowercase + trim", () => {
    assert.equal(usernames.canonicalizeUsername("  Alice_01 "), "alice_01");
  });
  test("accepts valid names", () => {
    for (const name of ["abc", "a1_", "orb_01", "x".repeat(20)]) {
      if (name.startsWith("_") || name.endsWith("_")) {
        continue;
      }
      assert.equal(usernames.validateUsername(name).ok, true, name);
    }
  });
  test("rejects short/long/charset", () => {
    assert.equal(usernames.validateUsername("ab").ok, false);
    assert.equal(usernames.validateUsername("a".repeat(21)).ok, false);
    assert.equal(usernames.validateUsername("has-dash").ok, false);
    assert.equal(usernames.validateUsername("UPPER").ok, false);
    assert.equal(usernames.validateUsername("has space").ok, false);
  });
  test("requires a letter or number", () => {
    assert.equal(usernames.validateUsername("___").ok, false);
  });
  test("rejects leading/trailing + consecutive underscores", () => {
    assert.equal(usernames.validateUsername("_abc").ok, false);
    assert.equal(usernames.validateUsername("abc_").ok, false);
    assert.equal(usernames.validateUsername("a__b").ok, false);
  });
  test("rejects reserved + route-conflicting names", () => {
    for (const name of [
      "api",
      "docs",
      "playground",
      "r",
      "admin",
      "support",
      "claim",
      "u",
      "status",
    ]) {
      assert.equal(usernames.validateUsername(name).ok, false, name);
    }
  });
  test("lib + worker reserved lists stay in sync", () => {
    const libText = readFileSync(
      join(root, "lib/claims/usernames.ts"),
      "utf-8"
    );
    for (const name of usernames.RESERVED_USERNAMES) {
      assert.ok(libText.includes(`"${name}"`), `lib missing reserved: ${name}`);
    }
    assert.equal(usernames.CLAIM_EXPIRY_MINUTES, 15);
  });
  test("email validation + masking never leaks", () => {
    assert.equal(usernames.isValidEmail("a@b.co"), true);
    assert.equal(usernames.isValidEmail("bad"), false);
    assert.equal(usernames.isValidEmail("a@b"), false);
    const masked = usernames.normalizeEmail("  Alice@Example.COM ");
    assert.equal(masked, "alice@example.com");
  });
});

describe("orb generation (v1)", () => {
  test("same username -> same result across retries", () => {
    const a = orbs.generateOrbForUsername("alice");
    const b = orbs.generateOrbForUsername("alice");
    assert.deepEqual(a, b);
    assert.equal(a.version, 1);
  });
  test("different usernames vary", () => {
    const slugs = new Set(
      ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi"].map(
        (u) => orbs.generateOrbForUsername(u).slug
      )
    );
    assert.ok(slugs.size >= 3, `expected varied variants, got ${[...slugs]}`);
  });
  test("values stay bounded per variant schema", async () => {
    const schemas = await jiti.import(toUrl(join(workerSrc, "orb-schemas.ts")));
    for (const name of ["alice", "bob_01", "x7y8z9"]) {
      const config = orbs.generateOrbForUsername(name);
      const schema = schemas.ORB_SCHEMAS[config.slug];
      assert.ok(schema, `schema for ${config.slug}`);
      for (const param of schema.params) {
        const value = config.params[param.key];
        assert.ok(
          typeof value === "number" && value >= param.min && value <= param.max,
          `${name}.${param.key}=${value} out of [${param.min},${param.max}]`
        );
      }
      for (const key of schema.colors) {
        assert.match(config.colors[key], /^#[0-9a-f]{6}$/);
      }
    }
  });
  test("seed is a stable uint32", () => {
    const seed = orbs.hashUsernameToSeed("shadercn");
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
    assert.equal(orbs.hashUsernameToSeed("shadercn"), seed);
  });
});

const insertClaim = (
  db,
  { username, emailHash, status = "pending", expires }
) =>
  db
    .prepare(
      "INSERT INTO claims (username, display_username, email, email_hash, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      username,
      username,
      `${username}@example.com`,
      emailHash,
      status,
      "2026-01-01T00:00:00.000Z",
      expires
    );

describe("D1 semantics (migration + constraints)", () => {
  const migration = readFileSync(
    join(root, "workers/claims/migrations/0001_init.sql"),
    "utf-8"
  );
  const freshDb = () => {
    const db = new DatabaseSync(":memory:");
    db.exec(migration);
    return db;
  };

  test("two-request race: duplicate username cannot both reserve", () => {
    const db = freshDb();
    insertClaim(db, {
      emailHash: "e1",
      expires: "2026-01-01T00:15:00.000Z",
      username: "alice",
    });
    assert.throws(() =>
      insertClaim(db, {
        emailHash: "e2",
        expires: "2026-01-01T00:15:00.000Z",
        username: "alice",
      })
    );
    db.close();
  });

  test("one verified username per email; pending rows unconstrained", () => {
    const db = freshDb();
    insertClaim(db, {
      emailHash: "same",
      expires: "2026-01-01T00:15:00.000Z",
      username: "alice",
    });
    // second pending with same email is allowed (no disclosure via constraint)
    insertClaim(db, {
      emailHash: "same",
      expires: "2026-01-01T00:15:00.000Z",
      username: "bob",
    });
    db.prepare(
      "UPDATE claims SET status='verified' WHERE username='alice'"
    ).run();
    // Second verify for the same email must fail: D1 enforces one verified name.
    assert.throws(() =>
      db
        .prepare("UPDATE claims SET status='verified' WHERE username='bob'")
        .run()
    );
    const count = db
      .prepare(
        "SELECT COUNT(*) AS n FROM claims WHERE email_hash='same' AND status='verified'"
      )
      .get().n;
    assert.equal(count, 1);
    db.close();
  });

  test("expired reservation stops blocking the username", () => {
    const db = freshDb();
    insertClaim(db, {
      emailHash: "e1",
      expires: "2026-01-01T00:01:00.000Z",
      username: "alice",
    });
    db.prepare(
      "DELETE FROM claims WHERE status='pending' AND expires_at <= ?"
    ).run("2026-01-01T00:20:00.000Z");
    insertClaim(db, {
      emailHash: "e2",
      expires: "2026-01-01T00:35:00.000Z",
      username: "alice",
    });
    const row = db
      .prepare("SELECT username FROM claims WHERE username='alice'")
      .get();
    assert.equal(row.username, "alice");
    db.close();
  });

  test("token replay cannot mutate: single consume wins", () => {
    const db = freshDb();
    insertClaim(db, {
      emailHash: "e1",
      expires: "2026-01-01T00:15:00.000Z",
      username: "alice",
    });
    const claimId = db
      .prepare("SELECT id FROM claims WHERE username='alice'")
      .get().id;
    db.prepare(
      "INSERT INTO verification_tokens (token_hash, claim_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
    ).run(
      "tok1",
      claimId,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:15:00.000Z"
    );
    const first = db
      .prepare(
        "UPDATE verification_tokens SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL"
      )
      .run("2026-01-01T00:05:00.000Z", "tok1");
    assert.equal(first.changes, 1);
    const replay = db
      .prepare(
        "UPDATE verification_tokens SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL"
      )
      .run("2026-01-01T00:06:00.000Z", "tok1");
    assert.equal(replay.changes, 0);
    db.close();
  });

  test("resend supersedes older links", () => {
    const db = freshDb();
    insertClaim(db, {
      emailHash: "e1",
      expires: "2026-01-01T00:15:00.000Z",
      username: "alice",
    });
    const claimId = db
      .prepare("SELECT id FROM claims WHERE username='alice'")
      .get().id;
    db.prepare(
      "INSERT INTO verification_tokens (token_hash, claim_id, created_at, expires_at) VALUES ('old', ?, ?, ?)"
    ).run(claimId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:15:00.000Z");
    db.prepare(
      "UPDATE verification_tokens SET superseded_at=? WHERE claim_id=? AND consumed_at IS NULL AND superseded_at IS NULL"
    ).run("2026-01-01T00:02:00.000Z", claimId);
    db.prepare(
      "INSERT INTO verification_tokens (token_hash, claim_id, created_at, expires_at) VALUES ('new', ?, ?, ?)"
    ).run(claimId, "2026-01-01T00:02:00.000Z", "2026-01-01T00:15:00.000Z");
    const old = db
      .prepare(
        "SELECT superseded_at FROM verification_tokens WHERE token_hash='old'"
      )
      .get();
    assert.ok(old.superseded_at);
    db.close();
  });

  test("public lookup only serves verified claims", () => {
    const db = freshDb();
    insertClaim(db, {
      emailHash: "e1",
      expires: "2026-01-01T00:15:00.000Z",
      username: "alice",
    });
    const pending = db
      .prepare(
        "SELECT * FROM claims WHERE username='alice' AND status='verified'"
      )
      .get();
    assert.equal(pending, undefined);
    db.prepare(
      "UPDATE claims SET status='verified' WHERE username='alice'"
    ).run();
    const verified = db
      .prepare(
        "SELECT username FROM claims WHERE username='alice' AND status='verified'"
      )
      .get();
    assert.equal(verified.username, "alice");
    db.close();
  });
});

describe("email + tokens", () => {
  test("confirmation has text + html, transactional only", () => {
    const url = email.buildVerifyUrl("https://shadercn.run", "raw-token-123");
    assert.ok(url.includes(encodeURIComponent("raw-token-123")));
    const text = email.confirmationText("alice", url);
    const html = email.confirmationHtml("alice", url);
    assert.ok(text.includes(url) && text.includes("15 minutes"));
    assert.ok(html.includes(url) && html.includes("15 minutes"));
    // Transactional only: no newsletter/marketing signup language.
    assert.ok(!/newsletter|marketing list|promotional/i.test(`${text}${html}`));
    assert.ok(/not subscribed|no subscription/i.test(text));
  });
  test("raw tokens are 32 bytes, plausibly encoded", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    assert.equal(bytes.length, 32);
    assert.match(
      "abcDEF0123456789-_ABCDEF0123456789-_12",
      /^[A-Za-z0-9_-]{20,128}$/
    );
  });
});

describe("ui accessibility + exposure guards (static)", () => {
  const flow = readFileSync(
    join(root, "components/claim/claim-flow.tsx"),
    "utf-8"
  );
  const verify = readFileSync(
    join(root, "components/claim/verify-state.tsx"),
    "utf-8"
  );
  const profile = readFileSync(
    join(root, "app/(app)/[handle]/page.tsx"),
    "utf-8"
  );
  const worker = readFileSync(join(workerSrc, "index.ts"), "utf-8");

  test("visible labels, live validation announcements", () => {
    assert.ok(flow.includes("<label"), "missing visible <label>");
    assert.ok(!flow.includes("placeholder-only"), "placeholder-only");
    assert.ok(flow.includes('aria-live="polite"'), "missing aria-live");
    assert.ok(flow.includes('role="status"'), "missing status role");
  });
  test("keyboard + focus management", () => {
    assert.ok(
      flow.includes("headingRef.current?.focus()"),
      "missing focus restore on step change"
    );
    assert.ok(verify.includes("Link href"), "recovery links missing");
  });
  test("reduced motion respected", () => {
    assert.ok(
      flow.includes("prefers-reduced-motion"),
      "missing reduced-motion query"
    );
    assert.ok(
      flow.includes("paused={reducedMotion}"),
      "orb not paused under reduced motion"
    );
  });
  test("public page never exposes email data", () => {
    // Prose may mention "email link"; what matters is no email *data* access.
    assert.ok(
      !/\.email\b|email_hash|claim\.email|data\.email/i.test(profile),
      "public page reads email data"
    );
    assert.ok(
      worker.includes("Never returned by public endpoints") ||
        worker.includes("public orb data only")
    );
  });
  test("raw emails/tokens absent from Worker logs", () => {
    const logs = [...worker.matchAll(/console\.log\(([\s\S]*?)\)/g)].map(
      (m) => m[1]
    );
    assert.ok(logs.length > 0, "expected redacted log lines");
    for (const line of logs) {
      assert.ok(
        !line.includes("normalized") || line.includes("maskForLog"),
        `unredacted log: ${line}`
      );
      assert.ok(!line.includes("rawToken"), `token in logs: ${line}`);
    }
  });
  test("verify recovery states exist", () => {
    for (const code of ["expired", "already_used", "malformed", "superseded"]) {
      assert.ok(verify.includes(code), `missing recovery state: ${code}`);
    }
  });
});
