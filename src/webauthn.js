import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

const CHALLENGE_COOKIE = "webauthn_challenge";

export function challengeCookieHeader(state, { secure }) {
  const value = encodeURIComponent(JSON.stringify(state));
  const parts = [
    `${CHALLENGE_COOKIE}=${value}`,
    "Path=/admin",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=300",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearChallengeCookieHeader({ secure }) {
  const parts = [
    `${CHALLENGE_COOKIE}=`,
    "Path=/admin",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readChallengeCookie(request) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${CHALLENGE_COOKIE}=([^;]*)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function buildRegistrationOptions({ url, username, existingCredentials }) {
  return generateRegistrationOptions({
    rpName: "QR dinámicos",
    rpID: url.hostname,
    userName: username,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
}

export function verifyRegistration({ url, response, expectedChallenge }) {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: url.origin,
    expectedRPID: url.hostname,
  });
}

export function buildAuthenticationOptions({ url, allowCredentials }) {
  return generateAuthenticationOptions({
    rpID: url.hostname,
    allowCredentials,
    userVerification: "preferred",
  });
}

export function verifyAuthentication({ url, response, expectedChallenge, storedCredential }) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: url.origin,
    expectedRPID: url.hostname,
    credential: storedCredential,
  });
}

export function encodePublicKey(publicKey) {
  return isoBase64URL.fromBuffer(publicKey);
}

export function decodePublicKey(encoded) {
  return isoBase64URL.toBuffer(encoded);
}

export function normalizeUsername(raw) {
  return (raw || "").trim().toLowerCase();
}

export function isValidUsername(username) {
  return /^[a-z0-9_-]{3,24}$/.test(username);
}
