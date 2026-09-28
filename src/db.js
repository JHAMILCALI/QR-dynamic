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

export async function listCodes(db, ownerUsername) {
  const { results } = await db
    .prepare(
      `SELECT
         qc.code, qc.destination, qc.active, qc.created_at,
         COUNT(s.id) AS scan_count,
         MAX(s.timestamp) AS last_scan
       FROM qr_codes qc
       LEFT JOIN scans s ON s.code = qc.code
       WHERE qc.owner_username = ?
       GROUP BY qc.code
       ORDER BY qc.created_at DESC`
    )
    .bind(ownerUsername)
    .all();
  return results;
}

export async function createCode(db, { code, destination, ownerUsername }) {
  await db
    .prepare(
      "INSERT INTO qr_codes (code, destination, owner_username) VALUES (?, ?, ?)"
    )
    .bind(code, destination, ownerUsername)
    .run();
}

export async function updateDestination(db, { code, destination, ownerUsername }) {
  const result = await db
    .prepare(
      "UPDATE qr_codes SET destination = ?, updated_at = datetime('now') WHERE code = ? AND owner_username = ?"
    )
    .bind(destination, code, ownerUsername)
    .run();
  return result.meta.changes > 0;
}

export async function setActive(db, { code, active, ownerUsername }) {
  const result = await db
    .prepare(
      "UPDATE qr_codes SET active = ? WHERE code = ? AND owner_username = ?"
    )
    .bind(active ? 1 : 0, code, ownerUsername)
    .run();
  return result.meta.changes > 0;
}

export async function codeExists(db, code) {
  const row = await db
    .prepare("SELECT 1 FROM qr_codes WHERE code = ?")
    .bind(code)
    .first();
  return !!row;
}

export async function usernameExists(db, username) {
  const row = await db
    .prepare("SELECT 1 FROM credentials WHERE username = ? LIMIT 1")
    .bind(username)
    .first();
  return !!row;
}

export async function getCredentialsForUsername(db, username) {
  const { results } = await db
    .prepare("SELECT id, public_key, counter FROM credentials WHERE username = ?")
    .bind(username)
    .all();
  return results;
}

export async function getCredentialById(db, id) {
  return db
    .prepare("SELECT id, public_key, counter, username FROM credentials WHERE id = ?")
    .bind(id)
    .first();
}

export async function saveCredential(db, { id, publicKey, counter, username }) {
  await db
    .prepare(
      "INSERT INTO credentials (id, public_key, counter, username) VALUES (?, ?, ?, ?)"
    )
    .bind(id, publicKey, counter, username)
    .run();
}

export async function updateCredentialCounter(db, id, counter) {
  await db
    .prepare("UPDATE credentials SET counter = ? WHERE id = ?")
    .bind(counter, id)
    .run();
}
