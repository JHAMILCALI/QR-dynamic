import {
  listCodes,
  createCode,
  updateDestination,
  setActive,
  codeExists,
  usernameExists,
  getCredentialById,
  saveCredential,
  updateCredentialCounter,
} from "./db.js";
import { qrImageUrl } from "./qrcode.js";
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
const SWA_BROWSER_CDN =
  "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@14.0.0/dist/bundle/index.umd.min.js";

function randomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
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
    return Response.redirect(url.origin + "/", 303);
  }

  if (request.method === "POST" && url.pathname === "/admin/update") {
    const form = await request.formData();
    const code = form.get("code")?.toString();
    const destination = form.get("destination")?.toString().trim();
    if (!code || !destination || !isHttpUrl(destination)) {
      return new Response("Falta un destino http(s) válido", { status: 400 });
    }
    await updateDestination(env.DB, { code, destination, ownerUsername: session.username });
    return Response.redirect(url.origin + "/", 303);
  }

  if (request.method === "POST" && url.pathname === "/admin/toggle") {
    const form = await request.formData();
    const code = form.get("code")?.toString();
    const active = form.get("active") === "1";
    if (code) await setActive(env.DB, { code, active, ownerUsername: session.username });
    return Response.redirect(url.origin + "/", 303);
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

function pageShell(title, body) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; text-align: center; }
  button { font-size: 1rem; padding: 0.6rem 1.2rem; border-radius: 8px; border: none; background: #2563eb; color: white; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  input { font-size: 1rem; padding: 0.5rem; width: 100%; box-sizing: border-box; margin-bottom: 1rem; }
  #status { margin-top: 1rem; color: #b91c1c; }
</style>
<script src="${SWA_BROWSER_CDN}"></script>
</head>
<body>
${body}
</body>
</html>`;
}

function renderAuthPage() {
  return pageShell(
    "Entrar — QR dinámicos",
    `
  <h1>QR dinámicos</h1>
  <button id="loginBtn">Iniciar sesión con tu passkey</button>
  <p><a href="#" id="showRegister">¿Primera vez? Crea tu cuenta</a></p>
  <div id="registerBox" style="display:none">
    <input type="text" id="username" placeholder="elige-un-usuario" autocomplete="username" pattern="[a-z0-9_-]{3,24}">
    <button id="registerBtn">Registrar passkey</button>
  </div>
  <p id="status"></p>
  <script>
    const statusEl = document.getElementById('status');

    document.getElementById('showRegister').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('registerBox').style.display = 'block';
      e.target.style.display = 'none';
    });

    document.getElementById('loginBtn').addEventListener('click', async () => {
      statusEl.textContent = '';
      try {
        const optsRes = await fetch('/admin/auth/login-options', { method: 'POST' });
        if (!optsRes.ok) throw new Error(await optsRes.text());
        const options = await optsRes.json();
        const response = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });
        const verifyRes = await fetch('/admin/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        });
        if (!verifyRes.ok) throw new Error(await verifyRes.text());
        window.location.href = '/';
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
      }
    });

    document.getElementById('registerBtn').addEventListener('click', async () => {
      statusEl.textContent = '';
      const username = document.getElementById('username').value.trim().toLowerCase();
      try {
        const optsRes = await fetch('/admin/auth/register-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        if (!optsRes.ok) throw new Error(await optsRes.text());
        const options = await optsRes.json();
        const response = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });
        const verifyRes = await fetch('/admin/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        });
        if (!verifyRes.ok) throw new Error(await verifyRes.text());
        window.location.href = '/';
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
      }
    });
  </script>`
  );
}

function renderDashboard(origin, username, codes) {
  const rows = codes
    .map(
      (c) => `
    <tr>
      <td><a href="${origin}/${c.code}" target="_blank">${c.code}</a></td>
      <td>
        <form method="POST" action="/admin/update" class="inline">
          <input type="hidden" name="code" value="${c.code}">
          <input type="url" name="destination" value="${escapeHtml(c.destination)}" required>
          <button type="submit">Guardar</button>
        </form>
      </td>
      <td>${c.scan_count}</td>
      <td>${c.last_scan ?? "—"}</td>
      <td>
        <form method="POST" action="/admin/toggle" class="inline">
          <input type="hidden" name="code" value="${c.code}">
          <input type="hidden" name="active" value="${c.active ? "0" : "1"}">
          <button type="submit">${c.active ? "Desactivar" : "Activar"}</button>
        </form>
      </td>
      <td><img src="${qrImageUrl(origin + "/" + c.code, 100)}" width="80" height="80" alt="QR ${c.code}"></td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel de QR dinámicos</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { border-bottom: 1px solid #ddd; padding: 0.5rem; text-align: left; vertical-align: middle; }
  form.inline { display: flex; gap: 0.5rem; }
  input[type=url] { flex: 1; }
  .new-code { margin-top: 2rem; padding: 1rem; background: #f5f5f5; border-radius: 8px; }
  .top-bar { display: flex; justify-content: space-between; align-items: center; }
</style>
</head>
<body>
  <div class="top-bar">
    <h1>Panel de QR dinámicos</h1>
    <div>
      <span>Conectado como <strong>${escapeHtml(username)}</strong></span>
      <form method="POST" action="/admin/logout" style="display:inline">
        <button type="submit">Cerrar sesión</button>
      </form>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Código</th><th>Destino</th><th>Escaneos</th><th>Último escaneo</th><th>Estado</th><th>QR</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">Todavía no tienes códigos.</td></tr>'}</tbody>
  </table>

  <div class="new-code">
    <h2>Crear nuevo QR</h2>
    <form method="POST" action="/admin/create">
      <label>Código (opcional, se genera uno si lo dejas vacío):
        <input type="text" name="code" pattern="[a-zA-Z0-9_-]+">
      </label><br><br>
      <label>URL destino:
        <input type="url" name="destination" required style="width: 320px;">
      </label><br><br>
      <button type="submit">Crear</button>
    </form>
  </div>
</body>
</html>`;
}
