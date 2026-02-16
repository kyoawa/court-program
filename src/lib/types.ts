export interface ProductDetail {
  productId: number;
  globalProductId: string | null;
  sku: string | null;
  internalName: string | null;
  productName: string | null;
  description: string | null;
  onlineDescription: string | null;
  masterCategory: string | null;
  categoryId: number | null;
  category: string | null;
  imageUrl: string | null;
  imageUrls: string[] | null;
  strainId: number | null;
  strain: string | null;
  strainType: string | null;
  size: string | null;
  netWeight: number | null;
  netWeightUnitId: number | null;
  netWeightUnit: string | null;
  brandId: number | null;
  brandName: string | null;
  vendorId: number | null;
  vendorName: string | null;
  isCannabis: boolean;
  isActive: boolean;
  thcContent: number | null;
  thcContentUnit: string | null;
  cbdContent: number | null;
  cbdContentUnit: string | null;
  price: number | null;
  medPrice: number | null;
  recPrice: number | null;
  unitCost: number | null;
  createdDate: string | null;
  lastModifiedDateUTC: string | null;
}

export interface ProductCategory {
  productCategoryId: number;
  globalProductCategoryId: string | null;
  productCategoryName: string | null;
  masterCategory: string | null;
}

export interface SetImageRequest {
  productId: number;
  base64Image: string;
  fileName: string;
}

export interface SetImageResponse {
  imageId: number;
  imageUrl: string | null;
}

export interface DeleteImageRequest {
  productId: number;
  imageId: number;
}

export interface SuccessResult {
  result: boolean;
  message: string | null;
  data: unknown;
}

export interface ImageSearchResult {
  thumbnailUrl: string;
  originalUrl: string;
  title: string;
}

export interface ProductSearchRequest {
  productId: number;
  productName: string;
  brandName: string | null;
  category: string | null;
  strain: string | null;
}

export interface RepositoryImage {
  id: number;
  name: string;
  fileName: string;
  mimeType: string;
  groupName: string | null;
  thumbnailDataUrl: string | null;
  createdAt: string;
  rules: MatchingRule[];
}

export interface MatchingRule {
  id: number;
  imageId: number;
  brandName: string | null;
  category: string | null;
  strain: string | null;
  strainType: string | null;
  productNameKeywords: string[] | null;
  priority: number;
  createdAt: string;
}

export interface MatchResult {
  productId: number;
  productName: string | null;
  matchedImageId: number | null;
  matchedImageName: string | null;
  matchedRuleId: number | null;
}

export interface StrainDetail {
  strainId: number;
  globalStrainId: string | null;
  strainName: string | null;
  strainDescription: string | null;
  strainAbbreviation: string | null;
  strainType: string | null;
  externalId: string | null;
}
