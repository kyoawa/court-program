import { matchesQuery, parseQuery, type QueryTerm } from "./product-filters";
import type { ProductDetail } from "./types";

/**
 * The one place repository matching rules are evaluated. Used by the match,
 * preview, apply and conflicts routes so every screen agrees on which image
 * a product gets.
 */
export interface MatchProduct {
  productId: number;
  productName: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
  strainType: string | null;
  internalName?: string | null;
}

export interface MatchRule {
  id: number;
  imageId: number;
  imageName?: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
  strainType: string | null;
  productNameKeywords: string[] | null;
  priority: number;
  createdAt?: string | Date | null;
}

export interface MatchOutcome {
  productId: number;
  productName: string | null;
  matchedImageId: number | null;
  matchedImageName: string | null;
  matchedRuleId: number | null;
  /** Other images whose rules also matched, best first. */
  alternativeImageIds: number[];
}

function sameText(value: string | null | undefined, pattern: string | null | undefined): boolean {
  if (pattern === null || pattern === undefined || pattern === "") return true;
  if (!value) return false;
  return value.trim().toLowerCase() === pattern.trim().toLowerCase();
}

/**
 * Rule keywords use the search grammar, restricted to the product name:
 *   og kush        both words must appear
 *   "og kush"      the phrase must appear
 *   -5pk           the word must not appear
 *   /\b1g\b/       regular expression
 * A multi-word keyword saved as one entry is treated as a phrase.
 */
export function keywordTerms(keywords: string[] | null | undefined): QueryTerm[] {
  if (!keywords?.length) return [];
  const query = keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map((keyword) => {
      const negate = keyword.startsWith("-") ? "-" : "";
      const body = negate ? keyword.slice(1) : keyword;
      const structured = /^(\/.*\/|".*"|[a-z]+:.*)$/i.test(body);
      return !structured && /\s/.test(body) ? `${negate}"${body}"` : keyword;
    })
    .join(" ");
  return parseQuery(query).map((term) => ({ ...term, field: term.field ?? "name" }));
}

export function keywordsMatch(productName: string | null | undefined, keywords: string[] | null | undefined): boolean {
  const terms = keywordTerms(keywords);
  if (!terms.length) return true;
  return matchesQuery({ productName: productName ?? null, internalName: null } as ProductDetail, terms);
}

export function ruleMatches(product: MatchProduct, rule: MatchRule): boolean {
  return (
    sameText(product.brandName, rule.brandName) &&
    sameText(product.category, rule.category) &&
    sameText(product.strain, rule.strain) &&
    sameText(product.strainType, rule.strainType) &&
    keywordsMatch(product.productName, rule.productNameKeywords)
  );
}

/** Higher priority wins; ties go to the older rule. */
export function sortRules<T extends MatchRule>(rules: T[]): T[] {
  const time = (value: MatchRule["createdAt"]) => (value ? new Date(value).getTime() : 0);
  return [...rules].sort((a, b) => b.priority - a.priority || time(a.createdAt) - time(b.createdAt) || a.id - b.id);
}

export type ExclusionMap = Map<number, Set<number>>;

/** Rules that match a product, best first, honoring per-image product exclusions. */
export function matchingRules<T extends MatchRule>(product: MatchProduct, sortedRules: T[], exclusions?: ExclusionMap): T[] {
  return sortedRules.filter((rule) => !exclusions?.get(rule.imageId)?.has(product.productId) && ruleMatches(product, rule));
}

export function matchProduct(product: MatchProduct, sortedRules: MatchRule[], exclusions?: ExclusionMap): MatchOutcome {
  const hits = matchingRules(product, sortedRules, exclusions);
  const best = hits[0];
  const alternatives: number[] = [];
  for (const rule of hits.slice(1)) {
    if (rule.imageId !== best.imageId && !alternatives.includes(rule.imageId)) alternatives.push(rule.imageId);
  }
  return {
    productId: product.productId,
    productName: product.productName,
    matchedImageId: best?.imageId ?? null,
    matchedImageName: best?.imageName ?? null,
    matchedRuleId: best?.id ?? null,
    alternativeImageIds: alternatives,
  };
}

export function matchProducts(products: MatchProduct[], rules: MatchRule[], exclusions?: ExclusionMap): MatchOutcome[] {
  const sorted = sortRules(rules);
  return products.map((product) => matchProduct(product, sorted, exclusions));
}
