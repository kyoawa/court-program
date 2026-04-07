// Strips dosage/weight info like "92.32mg", "8oz", "3.5g", "100mg(8oz)", "(8oz)", "1/8 oz", etc.
const DOSAGE_PATTERN =
  /\(?\s*\d*\.?\d+\s*(?:mg|g|oz|ml|ct|pk|pack|each)\s*\)?/gi;
const FRACTION_PATTERN = /\b\d+\/\d+\s*(?:oz|g)?\b/gi;
const PARENS_DOSAGE = /\(\s*\d*\.?\d+\s*(?:mg|g|oz|ml)\s*\)/gi;

function cleanProductName(name: string): string {
  name = name.replace(PARENS_DOSAGE, "");
  name = name.replace(DOSAGE_PATTERN, "");
  name = name.replace(FRACTION_PATTERN, "");
  name = name.replace(/(\s*-\s*)+/g, " - ");
  name = name.replace(/^\s*-\s*|\s*-\s*$/g, "");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

export function buildSearchQuery(product: {
  productName: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
}): string {
  const name = cleanProductName(product.productName ?? "");
  const brand = (product.brandName ?? "").trim();
  const strain = (product.strain ?? "").trim();
  const cat = (product.category ?? "").toLowerCase().trim();

  // Flower / Deli Flower: prioritize strain name + bud-specific sources
  if (cat.includes("flower") || cat.includes("deli")) {
    if (strain) {
      return `${strain} cannabis strain bud site:leafly.com OR site:allbud.com OR site:weedmaps.com`;
    }
    const parts = [brand, name].filter(Boolean).join(" ");
    return `${parts} cannabis flower bud`;
  }

  // Pre-rolls: strain-focused
  if (cat.includes("pre-roll") || cat.includes("preroll") || cat.includes("pre roll")) {
    if (strain) {
      return `${strain} cannabis pre-roll joint`;
    }
    const parts = [brand, name].filter(Boolean).join(" ");
    return `${parts} cannabis pre-roll`;
  }

  // Edibles
  if (cat.includes("edible")) {
    const parts = [brand, name].filter(Boolean).join(" ");
    return `${parts} cannabis edible`;
  }

  // Concentrates
  if (cat.includes("concentrate")) {
    const parts = [brand, name].filter(Boolean).join(" ");
    return `${parts} cannabis concentrate`;
  }

  // Vapes / Cartridges
  if (cat.includes("vape") || cat.includes("cartridge") || cat.includes("cart")) {
    const parts = [brand, name].filter(Boolean).join(" ");
    return `${parts} cannabis vape cartridge`;
  }

  // Tinctures
  if (cat.includes("tincture")) {
    const parts = [brand, name].filter(Boolean).join(" ");
    return `${parts} cannabis tincture`;
  }

  // Topicals
  if (cat.includes("topical")) {
    const parts = [brand, name].filter(Boolean).join(" ");
    return `${parts} cannabis topical`;
  }

  // Default
  const parts = [brand, name].filter(Boolean).join(" ");
  return `${parts} cannabis product`;
}
