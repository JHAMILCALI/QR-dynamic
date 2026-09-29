import { getDestination, logScan } from "./db.js";
import { handleAdmin, renderHome } from "./admin.js";
import { qrDownloadResponse } from "./qrcode.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return renderHome(request, env, url);
    }

    if (url.pathname === "/admin" && request.method === "GET") {
      return Response.redirect(url.origin + "/", 302);
    }

    if (url.pathname === "/download/static" && request.method === "GET") {
      const value = url.searchParams.get("text")?.trim();
      const size = Number(url.searchParams.get("size"));
      if (!value || value.length > 2048 || ![150, 300, 500, 1000].includes(size)) {
        return new Response("Texto o tamaño inválido", { status: 400 });
      }
      return qrDownloadResponse(value, size, `qr-estatico-${size}.png`);
    }

    if (url.pathname.startsWith("/admin/")) {
      return handleAdmin(request, env, url);
    }

    const code = url.pathname.slice(1);
    const destination = await getDestination(env.DB, code);
    if (!destination) {
      return new Response("Código no encontrado", { status: 404 });
    }

    ctx.waitUntil(
      logScan(env.DB, {
        code,
        country: request.cf?.country,
        deviceType: /Mobile|Android|iPhone/i.test(
          request.headers.get("User-Agent") || ""
        )
          ? "mobile"
          : "desktop",
        referrer: request.headers.get("Referer"),
      })
    );

    return Response.redirect(destination, 302);
  },
};
