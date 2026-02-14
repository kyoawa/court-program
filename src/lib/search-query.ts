// Strips dosage/weight info like "92.32mg", "8oz", "3.5g", "100mg(8oz)", "(8oz)", "1/8 oz", etc.
const DOSAGE_PATTERN =
  /\(?\s*\d*\.?\d+\s*(?:mg|g|oz|ml|ct|pk|pack|each)\s*\)?/gi;
const FRACTION_PATTERN = /\b\d+\/\d+\s*(?:oz|g)?\b/gi;
const PARENS_DOSAGE = /\(\s*\d*\.?\d+\s*(?:mg|g|oz|ml)\s*\)/gi;

export function buildSearchQuery(product: {
  productName: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
}): string {
  let name = (product.productName ?? "").trim();

  // Remove dosage/weight patterns
  name = name.replace(PARENS_DOSAGE, "");
  name = name.replace(DOSAGE_PATTERN, "");
  name = name.replace(FRACTION_PATTERN, "");

  // Clean up leftover whitespace and dangling separators like " - - "
  name = name.replace(/(\s*-\s*)+/g, " - ");
  name = name.replace(/^\s*-\s*|\s*-\s*$/g, "");
  name = name.replace(/\s+/g, " ").trim();

  return name;
}
