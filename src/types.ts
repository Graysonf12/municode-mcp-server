// Field names below are confirmed against a real, working reference
// implementation of this unofficial API (not guessed) — see
// services/municodeClient.ts for the source note. Some fields are
// typed loosely (unknown/optional) where the reference implementation
// only read a subset of what the API actually returns.

export interface MunicodeJurisdiction {
  ClientID?: number;
  ClientName?: string;
  PopRangeId?: number;
  ClassificationId?: number;
  Website?: string;
  City?: string;
  ZipCode?: string;
  [key: string]: unknown;
}

export interface MunicodeProduct {
  // Confirmed live field names (camelCase) as of this build — the
  // reference implementation's PascalCase assumption (ProductName,
  // ProductID, Id) turned out to be stale. Both casings are kept as
  // optional so extraction can check either without crashing.
  productName?: string;
  productId?: number;
  publicationId?: number; // best-guess stand-in for the old "jobId" concept — UNCONFIRMED, see municodeClient.ts
  contentTypeId?: string; // e.g. "CODES" — a more reliable "is this the ordinance code" signal than name-matching
  latestUpdatedDate?: string;
  hasPdf?: boolean;
  // legacy/possible alternate casings, kept for defensive extraction
  ProductName?: string;
  ProductID?: number;
  Id?: number;
  [key: string]: unknown;
}

export interface MunicodeTocNode {
  Id?: string;
  Heading?: string;
  [key: string]: unknown;
}

export interface ResolvedProduct {
  productId: number;
  jobId: number; // CONFIRMED via GET /Jobs/latest/{productId} — no longer a guess
  productName: string;
  contentTypeId?: string;
}

export interface ResolvedJurisdiction {
  clientId: number;
  clientName: string;
  stateAbbr: string;
  city?: string;
  website?: string;
  products: MunicodeProduct[];
  codeProduct: ResolvedProduct | null; // best-guess "Code of Ordinances" match
  rawProductsIfEmpty?: unknown; // present only when products.length === 0, for debugging
}
