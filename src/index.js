import { getDestination, logScan } from "./db.js";
import { handleAdmin } from "./admin.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      return handleAdmin(request, env, url);
    }

    const code = url.pathname.slice(1);
    if (!code) {
      return new Response(
        "Sistema de QR dinámicos. Usa /admin para gestionar tus códigos.",
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }

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
