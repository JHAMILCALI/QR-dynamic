import {
  listCodes,
  createCode,
  updateDestination,
  setActive,
  codeExists,
} from "./db.js";
import { qrImageUrl } from "./qrcode.js";

const CODE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

function checkAuth(request, env) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) return false;
  const [, password] = atob(auth.slice(6)).split(":");
  return password === env.ADMIN_PASSWORD;
}

function unauthorized() {
  return new Response("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="QR Admin"' },
  });
}

export async function handleAdmin(request, env, url) {
  if (!env.ADMIN_PASSWORD) {
    return new Response(
      "Falta configurar ADMIN_PASSWORD (ver README.md)",
      { status: 500 }
    );
  }
  if (!checkAuth(request, env)) return unauthorized();

  if (request.method === "POST" && url.pathname === "/admin/create") {
    const form = await request.formData();
    const destination = form.get("destination")?.toString().trim();
    let code = form.get("code")?.toString().trim();
    if (!destination) return new Response("Falta el destino", { status: 400 });
    if (!code) code = randomCode();
    if (await codeExists(env.DB, code)) {
      return new Response("Ese código ya existe, elige otro", { status: 400 });
    }
    await createCode(env.DB, { code, destination });
    return Response.redirect(url.origin + "/admin", 303);
  }

  if (request.method === "POST" && url.pathname === "/admin/update") {
    const form = await request.formData();
    const code = form.get("code")?.toString();
    const destination = form.get("destination")?.toString().trim();
    if (code && destination) {
      await updateDestination(env.DB, { code, destination });
    }
    return Response.redirect(url.origin + "/admin", 303);
  }

  if (request.method === "POST" && url.pathname === "/admin/toggle") {
    const form = await request.formData();
    const code = form.get("code")?.toString();
    const active = form.get("active") === "1";
    if (code) await setActive(env.DB, { code, active });
    return Response.redirect(url.origin + "/admin", 303);
  }

  const codes = await listCodes(env.DB);
  return new Response(renderDashboard(url.origin, codes), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function renderDashboard(origin, codes) {
  const rows = codes
    .map(
      (c) => `
    <tr>
      <td><a href="${origin}/${c.code}" target="_blank">${c.code}</a></td>
      <td>
        <form method="POST" action="/admin/update" class="inline">
          <input type="hidden" name="code" value="${c.code}">
          <input type="url" name="destination" value="${c.destination}" required>
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
</style>
</head>
<body>
  <h1>Panel de QR dinámicos</h1>
  <table>
    <thead>
      <tr><th>Código</th><th>Destino</th><th>Escaneos</th><th>Último escaneo</th><th>Estado</th><th>QR</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">Todavía no hay códigos.</td></tr>'}</tbody>
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
