ALTER TABLE credentials ADD COLUMN username TEXT NOT NULL DEFAULT '';
ALTER TABLE qr_codes ADD COLUMN owner_username TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_credentials_username ON credentials(username);
CREATE INDEX idx_qr_codes_owner ON qr_codes(owner_username);
