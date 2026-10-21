import { parseQuery, type QueryTerm } from "./product-filters";
import type { RepositoryImage } from "./types";

/**
 * Search and filters for the Image Repository page. The query uses the same
 * grammar as product search (words, "phrases", -exclusions, /regex/) over the
 * image name, file name, group and rule text; name:, group: and rule: target
 * one of those.
 */
export type RulesFilter = "all" | "has" | "none";
export type AppliedFilter = "all" | "applied" | "never";
export type OriginFilter = "all" | "imported" | "uploaded";

export interface RepositoryFilters {
  query: string;
  group: string; // "all" | "__none__" | group name
  rules: RulesFilter;
  applied: AppliedFilter;
  origin: OriginFilter;
}

export const UNGROUPED = "__none__";

export const EMPTY_REPOSITORY_FILTERS: RepositoryFilters = { query: "", group: "all", rules: "all", applied: "all", origin: "all" };

export function ruleText(image: Pick<RepositoryImage, "rules">): string {
  return image.rules
    .map((rule) => [rule.brandName, rule.category, rule.strain, rule.strainType, ...(rule.productNameKeywords ?? [])].filter(Boolean).join(" "))
    .join("\n");
}

const FIELDS: Record<string, (image: RepositoryImage) => string> = {
  name: (image) => `${image.name}\n${image.fileName}`,
  group: (image) => image.groupName ?? "",
  rule: (image) => ruleText(image),
  rules: (image) => ruleText(image),
};

function haystack(image: RepositoryImage, field?: string): string {
  const reader = field ? FIELDS[field] : undefined;
  return (reader ? reader(image) : Object.values(FIELDS).slice(0, 3).map((read) => read(image)).join("\n")).toLowerCase();
}

export function imageMatchesQuery(image: RepositoryImage, terms: QueryTerm[]): boolean {
  return terms.every((term) => {
    const field = term.field && term.field in FIELDS ? term.field : undefined;
    const hay = haystack(image, field);
    const hit = term.regex ? term.regex.test(hay) : hay.includes(term.text);
    return term.negate ? !hit : hit;
  });
}

export function filterRepositoryImages(images: RepositoryImage[], filters: RepositoryFilters): RepositoryImage[] {
  const terms = parseQuery(filters.query ?? "", Object.keys(FIELDS));
  return images.filter((image) => {
    if (filters.group !== "all") {
      if (filters.group === UNGROUPED ? image.groupName !== null : image.groupName !== filters.group) return false;
    }
    if (filters.rules === "has" && image.rules.length === 0) return false;
    if (filters.rules === "none" && image.rules.length > 0) return false;
    if (filters.applied === "applied" && image.appliedCount === 0) return false;
    if (filters.applied === "never" && image.appliedCount > 0) return false;
    if (filters.origin === "imported" && !image.sourceUrl) return false;
    if (filters.origin === "uploaded" && image.sourceUrl) return false;
    return terms.length === 0 || imageMatchesQuery(image, terms);
  });
}

export function countActiveRepositoryFilters(filters: RepositoryFilters): number {
  return (Object.keys(EMPTY_REPOSITORY_FILTERS) as (keyof RepositoryFilters)[]).filter(
    (key) => key === "query" ? Boolean(filters.query.trim()) : filters[key] !== EMPTY_REPOSITORY_FILTERS[key],
  ).length;
}
