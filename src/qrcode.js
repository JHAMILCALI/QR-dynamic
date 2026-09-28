export function qrMargin(size) {
  return Math.min(50, Math.max(10, Math.round(size * 0.08)));
}

export function qrImageUrl(targetUrl, size = 300) {
  const encoded = encodeURIComponent(targetUrl);
  const margin = qrMargin(size);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&data=${encoded}`;
}
