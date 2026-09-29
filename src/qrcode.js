export function qrMargin(size) {
  return Math.min(50, Math.max(10, Math.round(size * 0.08)));
}

export function qrImageUrl(targetUrl, size = 300) {
  const encoded = encodeURIComponent(targetUrl);
  const margin = qrMargin(size);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&data=${encoded}`;
}

export async function qrDownloadResponse(targetUrl, size, filename) {
  try {
    const image = await fetch(qrImageUrl(targetUrl, size));
    if (!image.ok || !image.body) throw new Error("QR image unavailable");
    return new Response(image.body, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("No se pudo generar el QR", { status: 502 });
  }
}
