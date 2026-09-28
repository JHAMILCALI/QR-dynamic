CREATE TABLE qr_codes (
  code TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL REFERENCES qr_codes(code),
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  country TEXT,
  device_type TEXT,
  referrer TEXT
);

CREATE INDEX idx_scans_code ON scans(code);
