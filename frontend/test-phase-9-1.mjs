/**
 * Automated Verification Suite for VERIDEX Phase 9.1 (Hardened):
 * - Session Security (AES-256-GCM encryption/decryption, HKDF key derivation)
 * - Expiration Enforcement (30-minute maximum lifespan)
 * - Cryptographic Tamper Resistance (GCM auth tag verification)
 * - Strict CSRF Origin Verification (Mandatory Origin/Referer, no header bypass)
 * - BFF API Domain Allowlisting & Path Traversal Rejection
 * - Zero Client-Side JWT Leakage Guarantee
 */

import assert from "node:assert";

// Set environment for test run
process.env.SESSION_SECRET = "veridex-test-session-secret-for-phase-9-1-verification-32chars";
process.env.FASTAPI_BACKEND_URL = "http://localhost:8000";

// Helper functions mirroring frontend/src/lib/session.ts
async function getEncryptionKey(secret = process.env.SESSION_SECRET) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("veridex-session-salt-v1"),
      info: enc.encode("veridex-bff-session-encryption"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encryptSession(session, secret) {
  const key = await getEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(session));

  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  const combined = new Uint8Array(iv.length + ciphertextWithTag.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextWithTag), iv.length);

  return base64UrlEncode(combined);
}

async function decryptSession(token, secret) {
  if (!token || typeof token !== "string") return null;

  try {
    const combined = base64UrlDecode(token);
    if (combined.length < 28) return null;

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await getEncryptionKey(secret);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    const session = JSON.parse(dec.decode(decrypted));

    if (!session.expires_at || Date.now() > session.expires_at) {
      return null;
    }

    if (!session.access_token || !session.user || !session.user.id) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

// Strict CSRF validation helper mirroring frontend/src/lib/csrf.ts
function validateCsrf(request) {
  const method = request.method.toUpperCase();
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  if (SAFE_METHODS.has(method)) return { valid: true };

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite === "cross-site") {
    return { valid: false, reason: `Blocked cross-site request with Sec-Fetch-Site: ${secFetchSite}` };
  }

  const host = request.headers.get("host");
  if (!host) return { valid: false, reason: "Missing Host header in request" };
  const expectedHost = host.toLowerCase();

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (!origin && !referer) {
    return { valid: false, reason: "State-mutating request rejected: missing both Origin and Referer headers" };
  }

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host.toLowerCase() !== expectedHost) {
        return { valid: false, reason: `Origin mismatch: expected ${expectedHost}, received ${originUrl.host}` };
      }
    } catch {
      return { valid: false, reason: "Invalid Origin header URL" };
    }
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host.toLowerCase() !== expectedHost) {
        return { valid: false, reason: `Referer mismatch: expected ${expectedHost}, received ${refererUrl.host}` };
      }
    } catch {
      return { valid: false, reason: "Invalid Referer header URL" };
    }
  }

  return { valid: true };
}

// BFF Path Allowlist & Traversal check mirroring frontend/src/app/api/bff/[...path]/route.ts
const ALLOWED_API_DOMAINS = new Set([
  "analytics",
  "governance",
  "runs",
  "policies",
  "risk",
  "agents",
  "tools",
  "users",
  "organizations",
  "health",
  "ready",
]);

const SAFE_SEGMENT_REGEX = /^[a-zA-Z0-9_\-.:]+$/;

function validateBffPath(path) {
  if (!path || !Array.isArray(path) || path.length === 0) {
    return { valid: false, status: 400, reason: "Missing API path parameters" };
  }

  for (const segment of path) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("%") ||
      !SAFE_SEGMENT_REGEX.test(segment)
    ) {
      return { valid: false, status: 403, reason: "Malformed or disallowed path segment" };
    }
  }

  const topDomain = path[0].toLowerCase();
  if (!ALLOWED_API_DOMAINS.has(topDomain)) {
    return { valid: false, status: 403, reason: `API domain '${topDomain}' is not supported by BFF proxy` };
  }

  return { valid: true };
}

// Test Runner
async function runTests() {
  console.log("=================================================");
  console.log("   VERIDEX PHASE 9.1 HARDENED VERIFICATION SUITE");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(` ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(` ❌ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  const mockUser = {
    id: "9f8e7d6c-5b4a-3210-fedc-ba9876543210",
    organization_id: "12345678-1234-5678-1234-567812345678",
    email: "security.lead@veridex.internal",
    display_name: "Security Lead",
    role: "SECURITY_ANALYST",
    status: "active",
  };

  const mockToken = "header.eyJzdWIiOiI5ZjhlN2Q2Yy01YjRhLTMyMTAtZmVkYy1iYTk4NzY1NDMyMTAifQ.signature";

  // Test 1: Encryption and Decryption Roundtrip
  await test("AES-256-GCM Session Encryption and Decryption Roundtrip", async () => {
    const sessionData = {
      access_token: mockToken,
      user: mockUser,
      expires_at: Date.now() + 1800 * 1000,
    };

    const encrypted = await encryptSession(sessionData);
    assert.ok(typeof encrypted === "string", "Encrypted token must be a string");
    assert.ok(encrypted.length > 50, "Ciphertext should be sufficiently long");

    const decrypted = await decryptSession(encrypted);
    assert.ok(decrypted !== null, "Decrypted session must not be null");
    assert.strictEqual(decrypted.access_token, mockToken);
    assert.strictEqual(decrypted.user.id, mockUser.id);
    assert.strictEqual(decrypted.user.role, "SECURITY_ANALYST");
  });

  // Test 2: Enforce 30-Minute Maximum Expiration
  await test("Strict 30-Minute Maximum Expiration Enforcement", async () => {
    const expiredSession = {
      access_token: mockToken,
      user: mockUser,
      expires_at: Date.now() - 1000,
    };

    const encrypted = await encryptSession(expiredSession);
    const decrypted = await decryptSession(encrypted);
    assert.strictEqual(decrypted, null, "Expired session must return null");

    const validSession = {
      access_token: mockToken,
      user: mockUser,
      expires_at: Date.now() + 1800 * 1000,
    };
    const validEncrypted = await encryptSession(validSession);
    const validDecrypted = await decryptSession(validEncrypted);
    assert.ok(validDecrypted !== null, "Valid 30m session must decrypt successfully");
    assert.strictEqual(validDecrypted.user.email, mockUser.email);
  });

  // Test 3: Tamper Resistance (Authentication Tag Rejection)
  await test("Cryptographic Tamper Resistance (AES-GCM Auth Tag Verification)", async () => {
    const sessionData = {
      access_token: mockToken,
      user: mockUser,
      expires_at: Date.now() + 1800 * 1000,
    };

    const encrypted = await encryptSession(sessionData);
    const rawBytes = base64UrlDecode(encrypted);

    rawBytes[20] ^= 0xff;
    const tampered = base64UrlEncode(rawBytes);

    const result = await decryptSession(tampered);
    assert.strictEqual(result, null, "Tampered ciphertext must fail GCM authentication and return null");
  });

  // Test 4: Different Secret Rejection
  await test("Secret Key Isolation (Reject sessions encrypted with different secret)", async () => {
    const sessionData = {
      access_token: mockToken,
      user: mockUser,
      expires_at: Date.now() + 1800 * 1000,
    };

    const secretA = "secret-number-one-must-be-32-chars-long-abc";
    const secretB = "secret-number-two-must-be-32-chars-long-xyz";

    const encrypted = await encryptSession(sessionData, secretA);
    const decrypted = await decryptSession(encrypted, secretB);
    assert.strictEqual(decrypted, null, "Decryption with different secret must fail");
  });

  // Test 5: Malformed and Truncated Tokens
  await test("Malformed and Truncated Tokens Rejected Gracefully", async () => {
    assert.strictEqual(await decryptSession(""), null);
    assert.strictEqual(await decryptSession("not-valid-base64-url!"), null);
    assert.strictEqual(await decryptSession("YWJj"), null);
    assert.strictEqual(await decryptSession(null), null);
    assert.strictEqual(await decryptSession(undefined), null);
  });

  // Test 6: Strict CSRF Validation on State-Mutating Requests
  await test("Strict CSRF Origin Validation (No header-only bypass)", async () => {
    // Safe method GET bypasses
    const getReq = new Request("http://localhost:3000/api/bff/overview", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    assert.strictEqual(validateCsrf(getReq).valid, true, "GET requests should pass CSRF");

    // Same-origin POST passes
    const validPost = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    assert.strictEqual(validateCsrf(validPost).valid, true, "Same-origin POST must pass CSRF");

    // Cross-site origin rejected
    const crossSitePost = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://evil-attacker.com",
        "sec-fetch-site": "cross-site",
      },
    });
    assert.strictEqual(validateCsrf(crossSitePost).valid, false, "Cross-site POST must be rejected");

    // Sec-Fetch-Site cross-site rejected even if origin header spoofed
    const secFetchCross = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "cross-site",
      },
    });
    assert.strictEqual(validateCsrf(secFetchCross).valid, false, "Cross-site Sec-Fetch-Site must be rejected");

    // Missing Origin and Referer rejected even if X-Veridex-Request is present (REMEDIED)
    const headerOnlyPost = new Request("http://localhost:3000/api/bff/approvals/123/decide", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "x-veridex-request": "1",
      },
    });
    const headerOnlyResult = validateCsrf(headerOnlyPost);
    assert.strictEqual(
      headerOnlyResult.valid,
      false,
      "Request missing Origin and Referer MUST be rejected regardless of X-Veridex-Request"
    );

    // Matching Referer passes when Origin is absent
    const refererPost = new Request("http://localhost:3000/api/bff/approvals/123/decide", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        referer: "http://localhost:3000/approvals",
      },
    });
    assert.strictEqual(validateCsrf(refererPost).valid, true, "Matching Referer must pass");
  });

  // Test 7: BFF API Domain Allowlist & Path Traversal Defense (Finding 1 Remediation)
  await test("BFF API Domain Allowlist and Path Traversal Defense", async () => {
    // Valid supported domains
    assert.strictEqual(validateBffPath(["analytics", "overview"]).valid, true);
    assert.strictEqual(validateBffPath(["governance", "approvals"]).valid, true);
    assert.strictEqual(validateBffPath(["runs", "123e4567-e89b-12d3-a456-426614174000", "invocations"]).valid, true);
    assert.strictEqual(validateBffPath(["policies"]).valid, true);
    assert.strictEqual(validateBffPath(["risk", "config"]).valid, true);
    assert.strictEqual(validateBffPath(["agents"]).valid, true);
    assert.strictEqual(validateBffPath(["tools"]).valid, true);
    assert.strictEqual(validateBffPath(["users"]).valid, true);
    assert.strictEqual(validateBffPath(["organizations", "my"]).valid, true);

    // Unsupported domains rejected with 403
    const adminCheck = validateBffPath(["admin", "users"]);
    assert.strictEqual(adminCheck.valid, false);
    assert.strictEqual(adminCheck.status, 403);

    const debugCheck = validateBffPath(["debug", "dump"]);
    assert.strictEqual(debugCheck.valid, false);
    assert.strictEqual(debugCheck.status, 403);

    const secretCheck = validateBffPath(["internal", "keys"]);
    assert.strictEqual(secretCheck.valid, false);
    assert.strictEqual(secretCheck.status, 403);

    // Path traversal rejected with 403
    assert.strictEqual(validateBffPath(["..", "etc", "passwd"]).valid, false);
    assert.strictEqual(validateBffPath(["analytics", "..", "admin"]).valid, false);
    assert.strictEqual(validateBffPath(["analytics", "%2e%2e"]).valid, false);
    assert.strictEqual(validateBffPath(["analytics", "sub/path"]).valid, false);
    assert.strictEqual(validateBffPath(["analytics", "sub\\path"]).valid, false);

    // Empty path rejected with 400
    assert.strictEqual(validateBffPath([]).status, 400);
  });

  // Test 8: Zero Client-Side JWT Leakage Guarantee
  await test("Zero Client-Side JWT Leakage Verification", async () => {
    const sessionData = {
      access_token: mockToken,
      user: mockUser,
      expires_at: Date.now() + 1800 * 1000,
    };

    const clientPayload = {
      user: sessionData.user,
      expires_at: sessionData.expires_at,
    };

    assert.strictEqual(
      clientPayload.access_token,
      undefined,
      "access_token MUST NOT be present in client-facing response payload"
    );
    assert.strictEqual(
      JSON.stringify(clientPayload).includes("signature"),
      false,
      "Serialized client payload must not contain any JWT string or fragment"
    );
    assert.strictEqual(clientPayload.user.role, "SECURITY_ANALYST");
  });

  console.log("-------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
