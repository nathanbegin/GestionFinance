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
  `ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_kind_check`,
  `ALTER TABLE transactions ADD CONSTRAINT transactions_kind_check CHECK (kind IN ('expense', 'repayment', 'opening'))`,
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
  `ALTER TABLE attachments ALTER COLUMN data DROP NOT NULL`,
  `ALTER TABLE attachments ADD COLUMN IF NOT EXISTS blob_pathname TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_att_tx ON attachments(transaction_id)`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#2459d6',
    logo_type TEXT,
    logo_data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS keywords TEXT`,
  `UPDATE suppliers SET keywords = 'Fertilisation du Nord, ProVert' WHERE keywords IS NULL AND name = 'Fertilisation du Nord ProVert'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_name ON suppliers(ledger_id, lower(name)) WHERE deleted_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS transaction_suppliers (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    PRIMARY KEY (transaction_id, supplier_id)
  )`,
  `INSERT INTO suppliers (ledger_id, name, color)
   SELECT l.id, s.name, s.color FROM ledgers l
   CROSS JOIN (VALUES ('Uber', '#000000'), ('Sixt', '#ff5f00'), ('TELUS', '#4b286d'), ('Fertilisation du Nord ProVert', '#2e7d32')) AS s(name, color)
   WHERE NOT EXISTS (SELECT 1 FROM suppliers x WHERE x.ledger_id = l.id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_ledger ON transactions(ledger_id, occurred_on)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_ledger ON audit_log(ledger_id, created_at DESC)`,
  // --- Plusieurs comptes de dépenses (à deux ou en groupe) ---
  `ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS name TEXT`,
  `ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)`,
  `ALTER TABLE users ALTER COLUMN ledger_id DROP NOT NULL`,
  `CREATE TABLE IF NOT EXISTS ledger_members (
    ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ledger_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_members_user ON ledger_members(user_id)`,
  `INSERT INTO ledger_members (ledger_id, user_id) SELECT ledger_id, id FROM users WHERE ledger_id IS NOT NULL ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS transaction_shares (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    share_cents INTEGER NOT NULL CHECK (share_cents >= 0),
    PRIMARY KEY (transaction_id, user_id)
  )`,
  `INSERT INTO transaction_shares (transaction_id, user_id, share_cents)
   SELECT t.id, m.user_id, t.other_share_cents FROM transactions t
   JOIN ledger_members m ON m.ledger_id = t.ledger_id AND m.user_id <> t.paid_by
   WHERE t.other_share_cents > 0
     AND NOT EXISTS (SELECT 1 FROM transaction_shares s WHERE s.transaction_id = t.id)
     AND (SELECT count(*) FROM ledger_members x WHERE x.ledger_id = t.ledger_id) = 2
   ON CONFLICT DO NOTHING`,
  // --- Synchronisation hors ligne et notifications ---
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_id TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_client_id ON transactions(ledger_id, client_id) WHERE client_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)`,
];

for (const s of statements) {
  await sql.query(s);
}
console.log("Migration terminée.");
