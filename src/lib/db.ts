import { neon } from "@neondatabase/serverless";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing env var: DATABASE_URL");
  return url;
}

export function sql() {
  return neon(getConnectionString());
}

/**
 * Run this once to set up the schema.
 * Called from /api/repository/setup route.
 */
export async function initSchema() {
  const query = sql();

  await query`
    CREATE TABLE IF NOT EXISTS repository_images (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      file_name  TEXT NOT NULL,
      mime_type  TEXT NOT NULL,
      image_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await query`
    CREATE TABLE IF NOT EXISTS matching_rules (
      id                    SERIAL PRIMARY KEY,
      image_id              INTEGER NOT NULL REFERENCES repository_images(id) ON DELETE CASCADE,
      brand_name            TEXT,
      category              TEXT,
      strain                TEXT,
      strain_type           TEXT,
      product_name_contains TEXT,
      priority              INTEGER NOT NULL DEFAULT 0,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await query`
    CREATE INDEX IF NOT EXISTS idx_rules_image_id ON matching_rules(image_id)
  `;
  await query`
    CREATE INDEX IF NOT EXISTS idx_rules_brand ON matching_rules(brand_name)
  `;
  await query`
    CREATE INDEX IF NOT EXISTS idx_rules_category ON matching_rules(category)
  `;
}
