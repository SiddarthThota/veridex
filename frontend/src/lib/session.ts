/**
 * Session encryption and cookie security for VERIDEX Next.js BFF (Phase 9.1).
 *
 * Implements authenticated encryption using AES-256-GCM via the Web Crypto API
 * (SubtleCrypto). Access tokens are strictly sealed server-side and never exposed
 * to client-side JavaScript.
 */

import type { SessionData } from "@/types/auth";

export const SESSION_COOKIE_NAME = "veridex_session";
export const SESSION_MAX_AGE_SECONDS = 1800; // 30 minutes, strictly aligned with backend access_token_expire_minutes = 30

const DEV_FALLBACK_SECRET = "veridex-dev-secret-minimum-32-characters-for-aes-256-gcm!!";

/**
 * Derives a 256-bit AES-GCM CryptoKey from the environment secret using HKDF.
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? DEV_FALLBACK_SECRET : "");

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET environment variable is missing or less than 32 characters in production"
    );
  }

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

/**
 * Base64URL encode a Uint8Array.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64URL decode to a Uint8Array.
 */
function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt session data with AES-256-GCM.
 * Packed format: [12 bytes IV][Ciphertext + 16 bytes Tag] -> Base64URL string.
 */
export async function encryptSession(session: SessionData): Promise<string> {
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

/**
 * Decrypt session token string back into SessionData.
 * Returns null if token is invalid, corrupted, tampered, or expired.
 */
export async function decryptSession(token: string): Promise<SessionData | null> {
  if (!token || typeof token !== "string") {
    return null;
  }

  try {
    const combined = base64UrlDecode(token);
    // 12 bytes IV + at least 16 bytes auth tag = minimum 28 bytes
    if (combined.length < 28) {
      return null;
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await getEncryptionKey();

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    const session: SessionData = JSON.parse(dec.decode(decrypted));

    // Verify token validity against expiration timestamp (30 minutes max)
    if (!session.expires_at || Date.now() > session.expires_at) {
      return null;
    }

    // Sanity check: must contain access_token and user object
    if (!session.access_token || !session.user || !session.user.id) {
      return null;
    }

    return session;
  } catch {
    // Decryption failure (tampered, wrong key, or malformed encoding)
    return null;
  }
}

/**
 * Standard cookie configuration for the encrypted veridex_session cookie.
 */
export function getSessionCookieOptions(isProduction = process.env.NODE_ENV === "production") {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

