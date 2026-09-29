import {
  listCodes,
  getCodeForOwner,
  createCode,
  updateDestination,
  setActive,
  codeExists,
  usernameExists,
  getCredentialById,
  saveCredential,
  updateCredentialCounter,
} from "./db.js";
import { qrDownloadResponse } from "./qrcode.js";
import { renderAuthPage, renderDashboard } from "./ui.js";
import {
  isLocalHost,
  getSession,
  createSessionToken,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from "./session.js";
import {
  challengeCookieHeader,
  clearChallengeCookieHeader,
  readChallengeCookie,
  buildRegistrationOptions,
  verifyRegistration,
  buildAuthenticationOptions,
  verifyAuthentication,
  encodePublicKey,
  decodePublicKey,
  normalizeUsername,
  isValidUsername,
} from "./webauthn.js";

const CODE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function handleAdmin(request, env, url) {
  const secure = !isLocalHost(url.hostname);

  if (request.method === "POST" && url.pathname === "/admin/auth/login-options") {
    const options = await buildAuthenticationOptions({ url, allowCredentials: undefined });
    const headers = new Headers({ "content-type": "application/json" });
    headers.append(
      "Set-Cookie",
      challengeCookieHeader({ challenge: options.challenge, type: "login" }, { secure })
    );
    return new Response(JSON.stringify(options), { headers });
  }

  if (request.method === "POST" && url.pathname === "/admin/auth/register-options") {
    const body = await request.json().catch(() => ({}));
    const username = normalizeUsername(body.username);
    if (!isValidUsername(username)) {
      return new Response(
        "Nombre de usuario inválido (3-24 caracteres: letras, números, - o _)",
        { status: 400 }
      );
    }
    if (await usernameExists(env.DB, username)) {
      return new Response("Ese nombre de usuario ya fue tomado, elige otro", { status: 409 });
    }
    const options = await buildRegistrationOptions({ url, username, existingCredentials: [] });
    const headers = new Headers({ "content-type": "application/json" });
    headers.append(
      "Set-Cookie",
      challengeCookieHeader(
        { challenge: options.challenge, username, type: "register" },
        { secure }
      )
    );
    return new Response(JSON.stringify(options), { headers });
  }

  if (request.method === "POST" && url.pathname === "/admin/auth/verify") {
    const state = readChallengeCookie(request);
    if (!state) {
      return new Response("Falta el desafío, vuelve a intentarlo", { status: 400 });
    }
    const { challenge: expectedChallenge, username, type } = state;
    const response = await request.json();

    if (type === "register") {
      let verification;
      try {
        verification = await verifyRegistration({ url, response, expectedChallenge });
      } catch (err) {
        return new Response(`Error de verificación: ${err.message}`, { status: 400 });
      }
      if (!verification.verified || !verification.registrationInfo) {
        return new Response("No se pudo verificar la passkey", { status: 400 });
      }
      if (await usernameExists(env.DB, username)) {
        return new Response("Ese nombre de usuario ya fue tomado, elige otro", { status: 409 });
      }
      const { credential } = verification.registrationInfo;
      await saveCredential(env.DB, {
        id: credential.id,
        publicKey: encodePublicKey(credential.publicKey),
        counter: credential.counter,
        username,
      });
      const token = await createSessionToken(env, { username });
      const headers = new Headers({ "content-type": "application/json" });
      headers.append("Set-Cookie", sessionCookieHeader(token, { secure }));
      headers.append("Set-Cookie", clearChallengeCookieHeader({ secure }));
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (type === "login") {
      const stored = await getCredentialById(env.DB, response.id);
      if (!stored) {
        return new Response("Passkey no reconocida", { status: 400 });
      }
      const storedCredential = {
        id: stored.id,
        publicKey: decodePublicKey(stored.public_key),
        counter: stored.counter,
      };
      let verification;
      try {
        verification = await verifyAuthentication({
          url,
          response,
          expectedChallenge,
          storedCredential,
        });
      } catch (err) {
        return new Response(`Error de verificación: ${err.message}`, { status: 400 });
      }
      if (!verification.verified) {
        return new Response("No se pudo verificar la passkey", { status: 400 });
      }
      await updateCredentialCounter(env.DB, stored.id, verification.authenticationInfo.newCounter);
      const token = await createSessionToken(env, { username: stored.username });
      const headers = new Headers({ "content-type": "application/json" });
      headers.append("Set-Cookie", sessionCookieHeader(token, { secure }));
      headers.append("Set-Cookie", clearChallengeCookieHeader({ secure }));
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response("Solicitud inválida", { status: 400 });
  }

  if (request.method === "POST" && url.pathname === "/admin/logout") {
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": clearSessionCookieHeader({ secure }),
      },
    });
  }

  const session = await getSession(request, env);

  if (!session) return new Response("No autorizado", { status: 401 });

  if (request.method === "GET" && url.pathname === "/admin/download") {
    const code = url.searchParams.get("code") || "";
    if (!/^[a-zA-Z0-9_-]+$/.test(code) || !(await getCodeForOwner(env.DB, code, session.username))) {
      return new Response("QR no encontrado", { status: 404 });
    }
    return qrDownloadResponse(url.origin + "/" + code, 500, `qr-${code}.png`);
  }

  if (request.method === "POST" && url.pathname === "/admin/create") {
    const form = await request.formData();
    const destination = form.get("destination")?.toString().trim();
    let code = form.get("code")?.toString().trim();
    if (!destination || !isHttpUrl(destination)) {
      return new Response("Falta un destino http(s) válido", { status: 400 });
    }
    if (code) {
      if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
        return new Response("Código inválido (solo letras, números, - o _)", { status: 400 });
      }
    } else {
      code = randomCode();
    }
    if (await codeExists(env.DB, code)) {
      return new Response("Ese código ya existe, elige otro", { status: 400 });
    }
    await createCode(env.DB, { code, destination, ownerUsername: session.username });
    return Response.redirect(url.origin + "/#dynamic", 303);
  }

  if (request.method === "POST" && url.pathname === "/admin/update") {
    const form = await request.formData();
    const code = form.get("code")?.toString();
    const destination = form.get("destination")?.toString().trim();
    if (!code || !destination || !isHttpUrl(destination)) {
      return new Response("Falta un destino http(s) válido", { status: 400 });
    }
    await updateDestination(env.DB, { code, destination, ownerUsername: session.username });
    return Response.redirect(url.origin + "/#dynamic", 303);
  }

  if (request.method === "POST" && url.pathname === "/admin/toggle") {
    const form = await request.formData();
    const code = form.get("code")?.toString();
    const active = form.get("active") === "1";
    if (code) await setActive(env.DB, { code, active, ownerUsername: session.username });
    return Response.redirect(url.origin + "/#dynamic", 303);
  }

  return new Response("No encontrado", { status: 404 });
}

export async function renderHome(request, env, url) {
  const session = await getSession(request, env);
  if (!session) {
    return new Response(renderAuthPage(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  const codes = await listCodes(env.DB, session.username);
  return new Response(renderDashboard(url.origin, session.username, codes), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
