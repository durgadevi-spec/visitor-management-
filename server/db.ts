import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.ts";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined. Did you forget to provision a database?");
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 25,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

export const db = drizzle(pool, { schema });

export async function checkDatabaseConnection() {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (err: any) {
    console.error("Database connection failed:", err.message);
    return false;
  }
}

export async function ensureSystemSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id integer PRIMARY KEY DEFAULT 1,
      facility_name text NOT NULL DEFAULT 'Concept Trunk Interiors',
      company_logo text,
      contact_email text NOT NULL DEFAULT 'www.ctint.in',
      auto_checkout_enabled boolean NOT NULL DEFAULT true,
      auto_checkout_time text NOT NULL DEFAULT '23:59',
      timezone text NOT NULL DEFAULT 'Asia/Kolkata',
      require_photo boolean NOT NULL DEFAULT false
    )
  `);
  await pool.query(`
    ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS company_logo text
  `);
}

export async function ensureVisitorAuditTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_audit_log (
      id serial PRIMARY KEY,
      visitor_id text NOT NULL,
      action text NOT NULL,
      actor_user_id integer,
      actor_email text NOT NULL,
      details text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS visitor_audit_log_visitor_created_idx
    ON visitor_audit_log (visitor_id, created_at DESC)
  `);
}

export async function ensureVisitorGadgetsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_gadgets (
      id serial PRIMARY KEY,
      visitor_id text NOT NULL,
      name text NOT NULL,
      make_model text,
      serial_number text,
      approval_status text NOT NULL DEFAULT 'pending',
      reviewed_by integer,
      reviewed_at timestamptz,
      returned_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS visitor_gadgets_visitor_created_idx
    ON visitor_gadgets (visitor_id, created_at)
  `);
}
