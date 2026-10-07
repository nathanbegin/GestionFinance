import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant (voir .env.local)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS ledgers (
    id SERIAL PRIMARY KEY,
    invite_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
    kind TEXT NOT NULL CHECK (kind IN ('expense', 'repayment')),
    paid_by INTEGER NOT NULL REFERENCES users(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    other_share_cents INTEGER NOT NULL CHECK (other_share_cents >= 0),
    description TEXT NOT NULL,
    occurred_on DATE NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    transaction_id INTEGER,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS default_share_pct INTEGER NOT NULL DEFAULT 100 CHECK (default_share_pct BETWEEN 0 AND 100)`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_number TEXT`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    data BYTEA NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_att_tx ON attachments(transaction_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_ledger ON transactions(ledger_id, occurred_on)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_ledger ON audit_log(ledger_id, created_at DESC)`,
];

for (const s of statements) {
  await sql.query(s);
}
console.log("Migration terminée.");
