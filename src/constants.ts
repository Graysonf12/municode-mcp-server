// Unofficial, reverse-engineered Municode API base URLs.
// Municode does not publish or officially support this API — it is the
// same JSON API that library.municode.com's own single-page app calls
// under the hood. Confirmed against multiple independent working
// implementations as of this build; endpoints may change without notice.
//
// IMPORTANT (discovered via live DevTools network capture, Georgetown KY
// run): Municode's API is NOT all under one base URL. Two different bases
// are in active use:
//   - api.municode.com — confirmed working for /Clients/name,
//     /Clients/stateAbbr, /ClientContent/{id} (jurisdiction + product
//     lookup). This is the base the original reference implementation
//     assumed, and it's still correct for these specific endpoints.
//   - library.municode.com/api — confirmed via live capture for
//     /codesToc/children and /Products/name. The reference implementation's
//     assumption that these lived under api.municode.com was WRONG, which
//     is why table-of-contents/content calls kept 404ing even after field
//     names were fixed. CodesContent and search have NOT been separately
//     confirmed on this base yet — routed here as the best-supported guess
//     given the pattern, but treat as still ⟨verify at run⟩ until observed.
export const MUNICODE_API_BASE = "https://api.municode.com";
export const MUNICODE_CONTENT_API_BASE = "https://library.municode.com/api";
export const MUNICODE_LIBRARY_BASE = "https://library.municode.com";

// Root node ID for a code's table of contents when no specific node is
// requested. CORRECTED after live capture: node IDs are NOT small sequential
// integers (the old "10121" default was wrong) — they're structured mnemonic
// codes built from the document hierarchy, e.g. "COOR" (Code Of Ordinances,
// confirmed as a real root-level node via a live breadcrumb call),
// "COOR_CH44ZOLAUS" (Chapter 44, Zoning and Land Use), etc. "COOR" is the
// best default for a "Code of Ordinances" product specifically — a
// different product type (e.g. a standalone Zoning Ordinance) may use a
// different root code entirely; this is a reasonable default, not a
// universal constant.
export const DEFAULT_ROOT_NODE_ID = "COOR";

export const CHARACTER_LIMIT = 25000;

export const REQUEST_TIMEOUT_MS = 20000;
