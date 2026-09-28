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
  :root {
    --accent: #2563eb;
    --accent-hover: #1d4ed8;
    --text: #1f2937;
    --muted: #6b7280;
    --border: #e5e7eb;
    --bg: #f1f5f9;
    --card: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 700px;
    margin: 0 auto;
    padding: 3rem 1rem;
    text-align: center;
    background: var(--bg);
    color: var(--text);
  }
  h1 { font-size: 1.85rem; margin: 0 0 2rem; }
  h2 { font-size: 1.2rem; margin: 0 0 0.75rem; }
  p { color: var(--muted); line-height: 1.55; margin: 0 0 1rem; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.75rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    text-align: left;
  }
  .card h2, .card > p:first-of-type { text-align: center; }
  button, a.btn {
    display: inline-block;
    font-size: 1rem;
    font-weight: 500;
    padding: 0.65rem 1.4rem;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: white;
    cursor: pointer;
    text-decoration: none;
  }
  button:hover, a.btn:hover { background: var(--accent-hover); }
  input, select {
    font-size: 1rem;
    padding: 0.6rem 0.75rem;
    width: 100%;
    margin-bottom: 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: white;
    color: var(--text);
  }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  #toast {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%) translateY(10px);
    background: #1f2937;
    color: white;
    padding: 0.6rem 1.1rem;
    border-radius: 8px;
    font-size: 0.9rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease, transform 0.15s ease;
    max-width: 90%;
    z-index: 1000;
  }
  #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  #qrPreview { text-align: center; }
  #qrPreview img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 10px; background: white; padding: 0.5rem; }
  .size-row { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem; }
  .size-row label { color: var(--muted); font-size: 0.9rem; white-space: nowrap; }
  .size-row select { width: auto; flex: 1; margin-bottom: 0; }
  .center { text-align: center; }
  .qr-generator-layout { display: flex; gap: 2rem; flex-wrap: wrap; }
  .qr-form { flex: 1 1 240px; min-width: 220px; }
  .qr-result {
    flex: 1 1 220px;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding-left: 1.5rem;
    border-left: 1px solid var(--border);
  }
  @media (max-width: 520px) {
    .qr-result { border-left: none; border-top: 1px solid var(--border); padding-left: 0; padding-top: 1.5rem; }
  }
  a.subtle { color: var(--accent); text-decoration: none; font-size: 0.9rem; }
  a.subtle:hover { text-decoration: underline; }
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

  <div class="card">
    <h2>Generador de QR estático</h2>
    <p>Gratis, sin necesidad de cuenta. Escribe cualquier texto o URL, elige el tamaño y
       descarga la imagen. Este QR queda fijo: si luego quieres poder cambiar a dónde apunta
       sin reimprimirlo, usa la cuenta con passkey de abajo.</p>
    <div class="qr-generator-layout">
      <div class="qr-form">
        <input type="text" id="staticText" placeholder="https://ejemplo.com o cualquier texto">
        <div class="size-row">
          <label for="staticSize">Tamaño:</label>
          <select id="staticSize">
            <option value="150">150 × 150</option>
            <option value="300" selected>300 × 300</option>
            <option value="500">500 × 500</option>
            <option value="1000">1000 × 1000</option>
          </select>
        </div>
        <div class="center"><button id="genBtn">Generar QR</button></div>
      </div>
      <div class="qr-result">
        <div id="qrPreview"></div>
        <a id="downloadLink" href="#" class="btn" style="display:none">Descargar QR</a>
      </div>
    </div>
  </div>

  <div class="card center">
    <h2>¿Quieres poder editarlo después?</h2>
    <p>Con una cuenta (solo tu huella, PIN o llave de seguridad, sin contraseñas) puedes crear
       QR dinámicos: el mismo código impreso, pero cambias el destino cuando quieras y ves
       cuántas veces lo escanearon.</p>
    <button id="loginBtn">Iniciar sesión con tu passkey</button>
    <p><a href="#" id="showRegister" class="subtle">¿Primera vez? Crea tu cuenta</a></p>
    <div id="registerBox" style="display:none">
      <input type="text" id="username" placeholder="elige-un-usuario" autocomplete="username" pattern="[a-z0-9_-]{3,24}">
      <button id="registerBtn">Registrar passkey</button>
    </div>
  </div>

  <div id="toast"></div>
  <script>
    let toastTimer;
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    }
    function friendlyError(err) {
      if (err && err.name === 'NotAllowedError') return 'Se canceló o no se completó la verificación.';
      if (err && err.name === 'InvalidStateError') return 'Esa passkey ya está registrada en este dispositivo.';
      if (err && err.name === 'SecurityError') return 'Este sitio no es válido para passkeys.';
      const msg = (err && err.message) || 'Ocurrió un error, intenta de nuevo.';
      return msg.length > 80 ? 'Ocurrió un error, intenta de nuevo.' : msg;
    }

    document.getElementById('genBtn').addEventListener('click', () => {
      const text = document.getElementById('staticText').value.trim();
      const size = document.getElementById('staticSize').value;
      const preview = document.getElementById('qrPreview');
      const downloadLink = document.getElementById('downloadLink');
      if (!text) {
        preview.innerHTML = '';
        downloadLink.style.display = 'none';
        return;
      }
      const margin = Math.min(50, Math.max(10, Math.round(size * 0.08)));
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=' + margin + '&data=' + encodeURIComponent(text);
      preview.innerHTML = '<img src="' + qrUrl + '" width="' + size + '" height="' + size + '" alt="QR generado">';
      downloadLink.textContent = 'Descargar QR (' + size + 'x' + size + ')';
      downloadLink.style.display = 'inline-block';
      downloadLink.onclick = async (e) => {
        e.preventDefault();
        try {
          const resp = await fetch(qrUrl);
          const blob = await resp.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = 'qr-' + size + 'x' + size + '.png';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(objectUrl);
        } catch (err) {
          window.open(qrUrl, '_blank');
        }
      };
    });

    document.getElementById('showRegister').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('registerBox').style.display = 'block';
      e.target.style.display = 'none';
    });

    document.getElementById('loginBtn').addEventListener('click', async () => {
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
        showToast(friendlyError(err));
      }
    });

    document.getElementById('registerBtn').addEventListener('click', async () => {
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
        showToast(friendlyError(err));
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
