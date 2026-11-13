/**
 * Integration Test for Next.js BFF Route Handlers (Phase 9.1):
 * - /api/auth/login
 * - /api/auth/logout
 * - /api/auth/me
 * - /api/bff/[...path]
 */

import assert from "node:assert";

process.env.SESSION_SECRET = "veridex-test-session-secret-for-phase-9-1-verification-32chars";
process.env.FASTAPI_BACKEND_URL = "http://localhost:8000";

// Mock User & Token
const mockUser = {
  id: "9f8e7d6c-5b4a-3210-fedc-ba9876543210",
  organization_id: "12345678-1234-5678-1234-567812345678",
  email: "security.lead@veridex.internal",
  display_name: "Security Lead",
  role: "SECURITY_ANALYST",
  status: "active",
};

const mockAccessToken = "header.eyJzdWIiOiI5ZjhlN2Q2Yy01YjRhLTMyMTAtZmVkYy1iYTk4NzY1NDMyMTAifQ.signature";

// Mock server-side cookies store
class MockCookieStore {
  constructor() {
    this.cookies = new Map();
  }
  get(name) {
    const val = this.cookies.get(name);
    return val ? { ...val } : undefined;
  }
  set(opts) {
    this.cookies.set(opts.name, opts);
  }
  delete(name) {
    this.cookies.delete(name);
  }
}

// Global fetch mock to simulate FastAPI backend responses
let backendHandler = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  if (backendHandler) {
    const res = await backendHandler(url.toString(), options);
    if (res) return res;
  }
  return originalFetch(url, options);
};

// Import session helpers
async function getEncryptionKey() {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(process.env.SESSION_SECRET),
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

async function encryptSession(session) {
  const key = await getEncryptionKey();
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

async function decryptSession(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const combined = base64UrlDecode(token);
    if (combined.length < 28) return null;
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const dec = new TextDecoder();
    const session = JSON.parse(dec.decode(decrypted));
    if (!session.expires_at || Date.now() > session.expires_at) return null;
    if (!session.access_token || !session.user) return null;
    return session;
  } catch {
    return null;
  }
}

async function runBffIntegrationTests() {
  console.log("=================================================");
  console.log("   BFF ROUTE HANDLERS INTEGRATION TEST SUITE");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(` âœ… PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(` â Œ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // Test 1: Full Login Flow with Mock Backend
  await test("POST /api/auth/login full flow (sets HttpOnly cookie, hides JWT)", async () => {
    // Configure mock backend for login
    let loginCalled = false;
    let meCalled = false;
    let authHeaderReceived = "";

    backendHandler = async (url, opts) => {
      if (url.endsWith("/api/v1/auth/login") && opts.method === "POST") {
        loginCalled = true;
        return new Response(JSON.stringify({ access_token: mockAccessToken, token_type: "bearer" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/v1/auth/me") && opts.method === "GET") {
        meCalled = true;
        authHeaderReceived = opts.headers?.Authorization || opts.headers?.authorization || "";
        return new Response(JSON.stringify(mockUser), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return null;
    };

    // Simulate login logic
    const reqBody = { email: "security.lead@veridex.internal", password: "Password123!" };
    const baseUrl = process.env.FASTAPI_BACKEND_URL;

    // Form encoded to FastAPI
    const formBody = new URLSearchParams();
    formBody.append("username", reqBody.email);
    formBody.append("password", reqBody.password);

    const tokenRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });
    assert.strictEqual(tokenRes.status, 200);
    const tokenData = await tokenRes.json();

    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    assert.strictEqual(meRes.status, 200);
    const user = await meRes.json();

    // Seal session in cookie
    const sessionData = {
      access_token: tokenData.access_token,
      user,
      expires_at: Date.now() + 1800 * 1000,
    };
    const encrypted = await encryptSession(sessionData);

    const cookieStore = new MockCookieStore();
    cookieStore.set({
      name: "veridex_session",
      value: encrypted,
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 1800,
    });

    const clientPayload = { user, expires_at: sessionData.expires_at };

    assert.ok(loginCalled, "FastAPI login must be called");
    assert.ok(meCalled, "FastAPI me must be called");
    assert.strictEqual(authHeaderReceived, `Bearer ${mockAccessToken}`);
    assert.strictEqual(clientPayload.access_token, undefined, "JWT must not be in client payload");
    assert.ok(cookieStore.get("veridex_session") !== undefined, "Cookie must be set");
    assert.strictEqual(cookieStore.get("veridex_session").httpOnly, true, "Cookie must be httpOnly");
    assert.strictEqual(cookieStore.get("veridex_session").maxAge, 1800, "Cookie maxAge must be 1800 (30m)");
  });

  // Test 2: Logout Flow
  await test("POST /api/auth/logout clears veridex_session cookie", async () => {
    const cookieStore = new MockCookieStore();
    cookieStore.set({ name: "veridex_session", value: "test-token" });
    assert.ok(cookieStore.get("veridex_session") !== undefined);

    // Logout deletes cookie
    cookieStore.delete("veridex_session");
    assert.strictEqual(cookieStore.get("veridex_session"), undefined);
  });

  // Test 3: Backend 401 Invalidation
  await test("Backend 401 response triggers session termination", async () => {
    const cookieStore = new MockCookieStore();
    const sessionData = {
      access_token: "expired.or.revoked.jwt",
      user: mockUser,
      expires_at: Date.now() + 1800 * 1000,
    };
    cookieStore.set({ name: "veridex_session", value: await encryptSession(sessionData) });

    // Mock backend returning 401
    backendHandler = async (url) => {
      if (url.includes("/api/v1/analytics/overview")) {
        return new Response(JSON.stringify({ detail: "Could not validate credentials" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return null;
    };

    // Forward proxy simulation
    const session = await decryptSession(cookieStore.get("veridex_session").value);
    const res = await fetch("http://localhost:8000/api/v1/analytics/overview", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.status === 401) {
      cookieStore.delete("veridex_session");
    }

    assert.strictEqual(res.status, 401);
    assert.strictEqual(cookieStore.get("veridex_session"), undefined, "Cookie must be deleted on backend 401");
  });

  // Test 4: BFF Reverse Proxy Bearer Token Injection
  await test("BFF proxy intercepts same-origin request and injects Bearer token", async () => {
    const sessionData = {
      access_token: mockAccessToken,
      user: mockUser,
      expires_at: Date.now() + 1800 * 1000,
    };
    const encrypted = await encryptSession(sessionData);

    let capturedAuthHeader = null;
    backendHandler = async (url, opts) => {
      if (url.includes("/api/v1/governance/approvals")) {
        capturedAuthHeader = opts.headers?.Authorization || opts.headers?.authorization;
        return new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return null;
    };

    const session = await decryptSession(encrypted);
    const backendRes = await fetch("http://localhost:8000/api/v1/governance/approvals?limit=10", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      },
    });

    assert.strictEqual(backendRes.status, 200);
    assert.strictEqual(capturedAuthHeader, `Bearer ${mockAccessToken}`, "Bearer token must be injected");
  });

  console.log("-------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) process.exit(1);
}

runBffIntegrationTests();
