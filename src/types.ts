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
  Id?: number; // doubles as the "jobId" needed for TOC/content lookups
  ProductID?: number;
  ProductName?: string;
  [key: string]: unknown;
}

export interface MunicodeTocNode {
  Id?: string;
  Heading?: string;
  [key: string]: unknown;
}

export interface ResolvedProduct {
  jobId: number;
  productId: number;
  productName: string;
}

export interface ResolvedJurisdiction {
  clientId: number;
  clientName: string;
  stateAbbr: string;
  city?: string;
  website?: string;
  products: MunicodeProduct[];
  codeProduct: ResolvedProduct | null; // best-guess "Code of Ordinances" match
}
