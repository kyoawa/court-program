import { Pool } from "pg";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing env var: DATABASE_URL");
  return url;
}

let pool: Pool | undefined;

function getPool() {
  // Create the pool lazily: builds do not need a database connection.
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (error) => {
      console.error("Idle database connection failed:", error.message);
    });
  }
  return pool;
}

export async function withProductImageLock<T>(productId: number, action: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let locked = false;
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(172901, $1) AS locked", [productId]);
    locked = result.rows[0].locked;
    if (!locked) throw new Error("Another image replacement is running for this product. Retry after it finishes.");
    return await action();
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(172901, $1)", [productId]);
    } catch (error) {
      client.release(error instanceof Error ? error : new Error("Unable to release image lock"));
      throw error;
    }
    client.release();
  }
}

export function sql() {
  const connectionPool = getPool();
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Keep values separate from SQL, including arrays and binary images.
    const text = strings.reduce(
      (query, part, index) => query + (index ? `$${index}` : "") + part,
      "",
    );
    const result = await connectionPool.query(text, values);
    return result.rows;
  };
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
    CREATE TABLE IF NOT EXISTS image_replacements (
      operation_id UUID PRIMARY KEY,
      product_id INTEGER NOT NULL,
      old_urls JSONB NOT NULL,
      state JSONB NOT NULL DEFAULT '{"phase":"planned"}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

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

  // Backfill columns on repository_images so older deployments match the
  // current schema. CREATE TABLE IF NOT EXISTS is a no-op if the table
  // already exists with an older shape, so every column the code touches
  // needs a matching ADD COLUMN IF NOT EXISTS here.
  await query`ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS name TEXT`;
  await query`ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS file_name TEXT`;
  await query`ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS mime_type TEXT`;
  await query`ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS image_data BYTEA`;
  await query`ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await query`ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS group_name TEXT`;
  await query`ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await query`
    ALTER TABLE repository_images
    ADD COLUMN IF NOT EXISTS excluded_product_ids INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[]
  `;
  // Where a scraped image came from, so brand source scans can skip it.
  await query`ALTER TABLE repository_images ADD COLUMN IF NOT EXISTS source_url TEXT`;
  await query`CREATE INDEX IF NOT EXISTS idx_repository_images_source ON repository_images(source_url)`;

  // Saved third-party pages (brand sites, Leafly, Dutchie menus) to scan for product images.
  await query`
    CREATE TABLE IF NOT EXISTS brand_sources (
      id SERIAL PRIMARY KEY,
      brand_name TEXT NOT NULL,
      url TEXT NOT NULL,
      label TEXT,
      path_prefix TEXT,
      last_scanned_at TIMESTAMPTZ,
      last_scan_summary JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (brand_name, url)
    )
  `;
  // Optional Cookie header the user copies from their own browser session
  // for sites that need an age confirmation or a login before showing products.
  await query`ALTER TABLE brand_sources ADD COLUMN IF NOT EXISTS cookies TEXT`;

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

  // Backfill every column on matching_rules. This MUST run before the
  // legacy-data UPDATE below so we don't fail with "column does not exist"
  // on tables that predate any of these columns (including the old
  // product_name_contains scalar, which the UPDATE still references).
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS image_id INTEGER`;
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS brand_name TEXT`;
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS category TEXT`;
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS strain TEXT`;
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS strain_type TEXT`;
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS product_name_contains TEXT`;
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS product_name_keywords TEXT[]`;
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0`;
  await query`ALTER TABLE matching_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;

  await query`
    CREATE INDEX IF NOT EXISTS idx_rules_image_id ON matching_rules(image_id)
  `;
  await query`
    CREATE INDEX IF NOT EXISTS idx_rules_brand ON matching_rules(brand_name)
  `;
  await query`
    CREATE INDEX IF NOT EXISTS idx_rules_category ON matching_rules(category)
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

  await query`
    CREATE TABLE IF NOT EXISTS catalog_image_snapshots (
      product_id INTEGER PRIMARY KEY,
      captured_at TIMESTAMPTZ NOT NULL,
      images JSONB NOT NULL
    )
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

  // Backfill every column on uploaded_images.
  await query`ALTER TABLE uploaded_images ADD COLUMN IF NOT EXISTS product_id INTEGER`;
  await query`ALTER TABLE uploaded_images ADD COLUMN IF NOT EXISTS image_id INTEGER`;
  await query`ALTER TABLE uploaded_images ADD COLUMN IF NOT EXISTS image_url TEXT`;
  await query`ALTER TABLE uploaded_images ADD COLUMN IF NOT EXISTS location TEXT`;
  await query`ALTER TABLE uploaded_images ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  // Which repository image an upload came from, so the repository can show
  // where each image is applied and avoid applying it twice.
  await query`ALTER TABLE uploaded_images ADD COLUMN IF NOT EXISTS repository_image_id INTEGER`;
  await query`CREATE INDEX IF NOT EXISTS idx_uploaded_images_repo ON uploaded_images(repository_image_id)`;

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
  repositoryImageId?: number | null;
}): Promise<void> {
  await ensureSchema();
  const query = sql();
  const location = params.location ?? DEFAULT_LOCATION;
  await query`
    INSERT INTO uploaded_images (product_id, image_id, image_url, location, repository_image_id)
    VALUES (${params.productId}, ${params.imageId}, ${params.imageUrl}, ${location}, ${params.repositoryImageId ?? null})
    ON CONFLICT (product_id, image_id, location) DO UPDATE
      SET image_url = EXCLUDED.image_url, uploaded_at = NOW(),
          repository_image_id = COALESCE(EXCLUDED.repository_image_id, uploaded_images.repository_image_id)
  `;
}

/** Products that currently carry the given repository image (per this app's records). */
export async function productsWithRepositoryImage(imageId: number, location?: string): Promise<Set<number>> {
  await ensureSchema();
  const query = sql();
  const rows = await query`
    SELECT DISTINCT product_id FROM uploaded_images
    WHERE repository_image_id = ${imageId} AND location = ${location ?? DEFAULT_LOCATION}
  `;
  return new Set(rows.map((row) => row.product_id as number));
}

/** Per-image product exclusions for a set of repository images. */
export async function loadExclusions(imageIds?: number[]): Promise<Map<number, Set<number>>> {
  await ensureSchema();
  const query = sql();
  const rows = imageIds
    ? await query`SELECT id, COALESCE(excluded_product_ids, '{}'::INTEGER[]) AS excluded FROM repository_images WHERE id = ANY(${imageIds}::INTEGER[])`
    : await query`SELECT id, COALESCE(excluded_product_ids, '{}'::INTEGER[]) AS excluded FROM repository_images`;
  return new Map(rows.map((row) => [row.id as number, new Set((row.excluded as number[]) ?? [])]));
}

/** Every matching rule with its image name, in evaluation order. */
export async function loadMatchingRules(imageId?: number) {
  await ensureSchema();
  const query = sql();
  const rows = imageId
    ? await query`
        SELECT r.id, r.image_id, ri.name AS image_name, r.brand_name, r.category, r.strain, r.strain_type,
               r.product_name_keywords, r.priority, r.created_at
        FROM matching_rules r JOIN repository_images ri ON ri.id = r.image_id
        WHERE r.image_id = ${imageId}
        ORDER BY r.priority DESC, r.created_at ASC`
    : await query`
        SELECT r.id, r.image_id, ri.name AS image_name, r.brand_name, r.category, r.strain, r.strain_type,
               r.product_name_keywords, r.priority, r.created_at
        FROM matching_rules r JOIN repository_images ri ON ri.id = r.image_id
        ORDER BY r.priority DESC, r.created_at ASC`;
  return rows.map((row) => ({
    id: row.id as number,
    imageId: row.image_id as number,
    imageName: row.image_name as string,
    brandName: row.brand_name as string | null,
    category: row.category as string | null,
    strain: row.strain as string | null,
    strainType: row.strain_type as string | null,
    productNameKeywords: (row.product_name_keywords as string[] | null) ?? null,
    priority: row.priority as number,
    createdAt: row.created_at as string,
  }));
}

export async function findUploadedImageId(params: {
  productId: number;
  imageUrl: string;
  location?: string;
}): Promise<number | null> {
  const images = await findUploadedImageIdsByProduct(params);
  return images.find(image => image.imageUrl === params.imageUrl)?.imageId ?? null;
}

export async function findUploadedImageIdsByProduct(params: {
  productId: number;
  location?: string;
}): Promise<{ imageId: number; imageUrl: string }[]> {
  await ensureSchema();
  const query = sql();
  const location = params.location ?? DEFAULT_LOCATION;
  const rows = await query`
    SELECT DISTINCT ON (image_id) image_id, image_url FROM (
      SELECT (image->>'imageId')::integer AS image_id,
             image->>'imageUrl' AS image_url, 0 AS priority
      FROM catalog_image_snapshots, jsonb_array_elements(images) AS image
      WHERE product_id = ${params.productId}
      UNION ALL
      SELECT image_id, image_url, 1 AS priority FROM uploaded_images
      WHERE product_id = ${params.productId} AND location = ${location}
        AND NOT EXISTS (
          SELECT 1 FROM catalog_image_snapshots s
          WHERE s.product_id = ${params.productId} AND s.captured_at >= uploaded_images.uploaded_at
        )
    ) mappings ORDER BY image_id, priority
  `;
  return rows.map(r => ({ imageId: r.image_id as number, imageUrl: r.image_url as string }));
}

export async function deleteUploadedImageRecord(params: {
  productId: number;
  imageId: number;
  location?: string;
}): Promise<void> {
  await ensureSchema();
  const query = sql();
  const location = params.location ?? DEFAULT_LOCATION;
  await query`
    UPDATE catalog_image_snapshots
    SET images = COALESCE((SELECT jsonb_agg(image) FROM jsonb_array_elements(images) AS image
      WHERE (image->>'imageId')::integer <> ${params.imageId}), '[]'::jsonb)
    WHERE product_id = ${params.productId}
  `;
  await query`
    DELETE FROM uploaded_images
    WHERE product_id = ${params.productId}
      AND image_id = ${params.imageId}
      AND location = ${location}
  `;
}
