// Unofficial, reverse-engineered Municode API base URLs.
// Municode does not publish or officially support this API — it is the
// same JSON API that library.municode.com's own single-page app calls
// under the hood. Confirmed against multiple independent working
// implementations as of this build; endpoints may change without notice.
export const MUNICODE_API_BASE = "https://api.municode.com";
export const MUNICODE_LIBRARY_BASE = "https://library.municode.com";

// Root node ID for a code's table of contents when no specific node is
// requested — confirmed default used by existing working clients.
export const DEFAULT_ROOT_NODE_ID = "10121";

export const CHARACTER_LIMIT = 25000;

export const REQUEST_TIMEOUT_MS = 20000;
