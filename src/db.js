export async function getDestination(db, code) {
  const row = await db
    .prepare("SELECT destination FROM qr_codes WHERE code = ? AND active = 1")
    .bind(code)
    .first();
  return row ? row.destination : null;
}

export async function logScan(db, { code, country, deviceType, referrer }) {
  await db
    .prepare(
      "INSERT INTO scans (code, country, device_type, referrer) VALUES (?, ?, ?, ?)"
    )
    .bind(code, country ?? null, deviceType ?? null, referrer ?? null)
    .run();
}

export async function listCodes(db) {
  const { results } = await db
    .prepare(
      `SELECT
         qc.code, qc.destination, qc.active, qc.created_at,
         COUNT(s.id) AS scan_count,
         MAX(s.timestamp) AS last_scan
       FROM qr_codes qc
       LEFT JOIN scans s ON s.code = qc.code
       GROUP BY qc.code
       ORDER BY qc.created_at DESC`
    )
    .all();
  return results;
}

export async function createCode(db, { code, destination }) {
  await db
    .prepare("INSERT INTO qr_codes (code, destination) VALUES (?, ?)")
    .bind(code, destination)
    .run();
}

export async function updateDestination(db, { code, destination }) {
  await db
    .prepare(
      "UPDATE qr_codes SET destination = ?, updated_at = datetime('now') WHERE code = ?"
    )
    .bind(destination, code)
    .run();
}

export async function setActive(db, { code, active }) {
  await db
    .prepare("UPDATE qr_codes SET active = ? WHERE code = ?")
    .bind(active ? 1 : 0, code)
    .run();
}

export async function codeExists(db, code) {
  const row = await db
    .prepare("SELECT 1 FROM qr_codes WHERE code = ?")
    .bind(code)
    .first();
  return !!row;
}
