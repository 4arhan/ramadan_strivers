// Postgres access for Vercel serverless functions. Works with Vercel Postgres / Neon / Supabase /
// any Postgres: set DATABASE_URL (or POSTGRES_URL). Tables are created on first use.
const { Pool } = require('pg');
let pool, schemaP;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY, email TEXT UNIQUE, pass_hash TEXT, name TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(), last_seen TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS magic_links(
  token TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used BOOLEAN DEFAULT false);
CREATE TABLE IF NOT EXISTS sync_data(
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS competitions(
  code TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'Other',
  owner_id INT REFERENCES users(id) ON DELETE SET NULL,
  prizes JSONB NOT NULL DEFAULT '[]'::jsonb, open BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS participants(
  id SERIAL PRIMARY KEY, comp_code TEXT NOT NULL REFERENCES competitions(code) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL, user_id INT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL, grp TEXT NOT NULL DEFAULT '',
  total_pts INT NOT NULL DEFAULT 0, days_logged INT NOT NULL DEFAULT 0, avg_pct INT NOT NULL DEFAULT 0,
  quran_pages INT NOT NULL DEFAULT 0, last_day INT NOT NULL DEFAULT 0, days JSONB NOT NULL DEFAULT '{}'::jsonb,
  flagged BOOLEAN NOT NULL DEFAULT false, hidden BOOLEAN NOT NULL DEFAULT false, claimed BOOLEAN NOT NULL DEFAULT true,
  phone TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS participants_board_idx ON participants(comp_code, total_pts DESC);
CREATE INDEX IF NOT EXISTS participants_phone_idx ON participants(phone);
CREATE TABLE IF NOT EXISTS push_subs(
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL, sub JSONB NOT NULL, prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  tz TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, lang TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT now(), last_sent TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS buddies(
  code TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb, nudges JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_cache(key TEXT PRIMARY KEY, value JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
`;
function connString(){ return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || ''; }
function configured(){ return !!connString(); }
function getPool(){
  if(pool) return pool;
  const cs = connString();
  if(!cs){ const e = new Error('Database not configured: set DATABASE_URL in Vercel → Settings → Environment Variables (add Neon/Postgres from the Storage tab).'); e.status = 503; e.code = 'db_not_configured'; throw e; }
  const local = /localhost|127\.0\.0\.1/.test(cs);
  pool = new Pool({ connectionString: cs, max: 3, idleTimeoutMillis: 10000, ssl: local ? false : { rejectUnauthorized: false } });
  return pool;
}
function ensureSchema(){ if(!schemaP) schemaP = getPool().query(SCHEMA).catch(e => { schemaP = null; throw e; }); return schemaP; }
async function q(text, params){ await ensureSchema(); return getPool().query(text, params); }
async function one(text, params){ const r = await q(text, params); return r.rows[0] || null; }
module.exports = { q, one, configured, getPool };
