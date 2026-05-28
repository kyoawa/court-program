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
 * Idempotent schema setup. Memoized per process so we can safely call it
 * from any route's hot path — the actual ALTER/CREATE statements only run
 * on the first invocation of each cold start.
 */
let schemaPromise: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = initSchema().catch((err) => {
      // Reset on failure so the next request can retry.
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

/**
 * Run this once to set up the schema.
 * Called from /api/repository/setup route and from ensureSchema().
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

  // Migration: add group_name to repository_images
  await query`
    ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS group_name TEXT
  `;

  // Migration: track last update time for repository images
  await query`
    ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `;

  // Migration: add product_name_keywords array column
  await query`
    ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS product_name_keywords TEXT[]
  `;

  // Migration: copy old scalar values into new array column
  await query`
    UPDATE matching_rules
    SET product_name_keywords = ARRAY[product_name_contains]
    WHERE product_name_contains IS NOT NULL
      AND product_name_keywords IS NULL
  `;

  // Migration: drop old column
  await query`
    ALTER TABLE matching_rules DROP COLUMN IF EXISTS product_name_contains
  `;

  // Migration: per-image product exclusions for repository apply
  await query`
    ALTER TABLE repository_images
    ADD COLUMN IF NOT EXISTS excluded_product_ids INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[]
  `;

  // Track every image we upload so we can look up its integer imageId at delete time.
  // Dutchie's GET /products doesn't return imageIds — the integer is only handed back
  // once, by /products/set-image.
  await query`
    CREATE TABLE IF NOT EXISTS uploaded_images (
      id          SERIAL PRIMARY KEY,
      product_id  INTEGER NOT NULL,
      image_id    INTEGER NOT NULL,
      image_url   TEXT NOT NULL,
      location    TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(product_id, image_id, location)
    )
  `;

  await query`
    CREATE INDEX IF NOT EXISTS idx_uploaded_images_product
      ON uploaded_images(product_id, location)
  `;
  await query`
    CREATE INDEX IF NOT EXISTS idx_uploaded_images_url
      ON uploaded_images(image_url)
  `;
}

const DEFAULT_LOCATION = "BILLINGS";

export async function recordUploadedImage(params: {
  productId: number;
  imageId: number;
  imageUrl: string;
  location?: string;
}): Promise<void> {
  const query = sql();
  const location = params.location ?? DEFAULT_LOCATION;
  await query`
    INSERT INTO uploaded_images (product_id, image_id, image_url, location)
    VALUES (${params.productId}, ${params.imageId}, ${params.imageUrl}, ${location})
    ON CONFLICT (product_id, image_id, location) DO UPDATE
      SET image_url = EXCLUDED.image_url
  `;
}

export async function findUploadedImageId(params: {
  productId: number;
  imageUrl: string;
  location?: string;
}): Promise<number | null> {
  const query = sql();
  const location = params.location ?? DEFAULT_LOCATION;
  const rows = (await query`
    SELECT image_id FROM uploaded_images
    WHERE product_id = ${params.productId}
      AND location = ${location}
      AND image_url = ${params.imageUrl}
    LIMIT 1
  `) as { image_id: number }[];
  if (rows.length > 0) return rows[0].image_id;
  return null;
}

export async function findUploadedImageIdsByProduct(params: {
  productId: number;
  location?: string;
}): Promise<{ imageId: number; imageUrl: string }[]> {
  const query = sql();
  const location = params.location ?? DEFAULT_LOCATION;
  const rows = (await query`
    SELECT image_id, image_url FROM uploaded_images
    WHERE product_id = ${params.productId}
      AND location = ${location}
  `) as { image_id: number; image_url: string }[];
  return rows.map((r) => ({ imageId: r.image_id, imageUrl: r.image_url }));
}

export async function deleteUploadedImageRecord(params: {
  productId: number;
  imageId: number;
  location?: string;
}): Promise<void> {
  const query = sql();
  const location = params.location ?? DEFAULT_LOCATION;
  await query`
    DELETE FROM uploaded_images
    WHERE product_id = ${params.productId}
      AND image_id = ${params.imageId}
      AND location = ${location}
  `;
}
