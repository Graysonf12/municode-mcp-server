import axios, { AxiosError } from "axios";
import { MUNICODE_API_BASE, MUNICODE_CONTENT_API_BASE, MUNICODE_LIBRARY_BASE, REQUEST_TIMEOUT_MS } from "../constants.js";
import type {
  MunicodeJurisdiction,
  MunicodeProduct,
  MunicodeTocNode,
  ResolvedJurisdiction,
  ResolvedProduct
} from "../types.js";

/**
 * Client for the unofficial, reverse-engineered Municode API.
 *
 * These endpoints, parameter names, and field names are NOT from official
 * Municode documentation — Municode does not publish an API. They are
 * confirmed against a real, working, open-source reference implementation
 * (MIT-licensed, actively used) that talks to this same API to power its
 * own MCP server. This is the same JSON API library.municode.com's own
 * single-page app calls under the hood, which is why direct-fetching the
 * library.municode.com HTML has always failed for the SIR agent (it's a
 * client-rendered shell) while these endpoints return real JSON directly.
 *
 * RISK: because this is unofficial, Municode could change these endpoints
 * without notice. Nothing here has been observed against a live response
 * from this build environment (network egress here can't reach
 * api.municode.com) — the first real confirmation happens on live
 * deployment. Treat exactly like an ⟨verify at run⟩ item until then.
 */

const http = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "User-Agent": "municode-mcp-server/1.0 (+https://github.com/)",
    Accept: "application/json"
  }
});

// Content-API requests (codesToc/children, CodesContent, search,
// Products/name) returned HTTP 401 with an empty body when called without
// specific headers their own front-end always sends — live-observed on
// Georgetown, KY (job_id 438885, product_id 14009) after the base-URL fix
// confirmed the endpoint/params were otherwise correct. A live DevTools
// capture of the exact working browser request showed the header
// "X-Csrf: 1" present — a static value (not a per-session token), so safe
// to hardcode. Referer/Origin are included too since they were present on
// the same working request, even though X-Csrf looks like the more likely
// actual gate. (The captured request also had session/analytics cookies —
// deliberately NOT replicated here, since those are per-visitor tracking
// values, not something a server should reuse, and unlikely to be the
// actual access gate given X-Csrf's presence.)
const contentHttp = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "User-Agent": "municode-mcp-server/1.0 (+https://github.com/)",
    Accept: "application/json",
    Referer: MUNICODE_LIBRARY_BASE + "/",
    Origin: MUNICODE_LIBRARY_BASE,
    "X-Csrf": "1"
  }
});

export function formatMunicodeError(error: unknown, context?: string): string {
  const where = context ? ` (${context})` : "";
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const bodySnippet = safeStringifyErrorBody(error.response.data);
      if (status === 404) {
        return `Municode API returned 404${where} — the jurisdiction, product, or node ID was not found. Double-check the municipality name matches Municode's library exactly (try the name as it appears in the library.municode.com URL), or that job_id/product_id/node_id came from a prior tool call in this session rather than being guessed.${bodySnippet}`;
      }
      return `Municode API request failed${where} with HTTP ${status}. This is an unofficial API with no uptime guarantee — retry once before treating this as a hard block.${bodySnippet}`;
    }
    if (error.code === "ECONNABORTED") {
      return `Municode API request timed out${where} after ${REQUEST_TIMEOUT_MS}ms. Retry; if it persists, fall back to the §0B upload-loop workflow for this jurisdiction.`;
    }
    return `Municode API network error${where}: ${error.message}.`;
  }
  return `Unexpected error querying Municode API${where}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

// Surfaces whatever body Municode's server sent back on an error response
// (many APIs include a JSON error detail even on 5xx) so failures carry
// real diagnostic signal instead of just a status code. Truncated to keep
// error messages from ballooning.
function safeStringifyErrorBody(data: unknown): string {
  if (data === undefined || data === null) return "";
  try {
    const str = typeof data === "string" ? data : JSON.stringify(data);
    const truncated = str.length > 500 ? str.slice(0, 500) + "…" : str;
    return ` Server response body: ${truncated}`;
  } catch {
    return "";
  }
}

/** Look up a jurisdiction ("client" in Municode's terminology) by name + state. */
export async function getClientByName(
  clientName: string,
  stateAbbr: string
): Promise<MunicodeJurisdiction> {
  const response = await http.get<MunicodeJurisdiction>(`${MUNICODE_API_BASE}/Clients/name`, {
    params: { clientName, stateAbbr }
  });
  return response.data;
}

/** List all jurisdictions in a state that use Municode. */
export async function getClientsByState(stateAbbr: string): Promise<MunicodeJurisdiction[]> {
  const response = await http.get<MunicodeJurisdiction[]>(`${MUNICODE_API_BASE}/Clients/stateAbbr`, {
    params: { stateAbbr }
  });
  return response.data;
}

// Candidate wrapper field names in case ClientContent doesn't return a bare
// array for every jurisdiction — confirmed necessary after a live run
// (Georgetown, KY, client 11590) returned a wrapped shape: { codes: [...],
// features: [...], munidocs: [...] }, not a bare array or any of the
// generic names first guessed. "codes" is now confirmed live; the others
// are kept as fallbacks in case a different content type wraps differently.
const PRODUCTS_WRAPPER_FIELDS = ["codes", "Products", "products", "Items", "items", "Content", "content"];

function normalizeProductsResponse(raw: unknown): MunicodeProduct[] {
  if (Array.isArray(raw)) return raw as MunicodeProduct[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const field of PRODUCTS_WRAPPER_FIELDS) {
      const val = obj[field];
      if (Array.isArray(val)) return val as MunicodeProduct[];
    }
  }
  // Genuinely empty/unrecognized — return [] rather than throwing, so
  // callers can report "0 products found" instead of crashing outright.
  return [];
}

/**
 * Get the list of code "products" (Code of Ordinances, Zoning Ordinance,
 * etc.) a jurisdiction has, PLUS the raw response — the raw value lets a
 * caller inspect what Municode actually sent when the normalized list
 * comes back empty, rather than treating "empty" as necessarily meaning
 * "this jurisdiction has nothing" (live-observed to sometimes mean an
 * unrecognized wrapper shape instead — see server README).
 */
export async function getClientContentWithRaw(
  clientId: number
): Promise<{ products: MunicodeProduct[]; raw: unknown }> {
  const response = await http.get<unknown>(`${MUNICODE_API_BASE}/ClientContent/${clientId}`);
  return { products: normalizeProductsResponse(response.data), raw: response.data };
}

/** Get the list of code "products" a jurisdiction has (raw response discarded — use getClientContentWithRaw if you need to debug an empty result). */
export async function getClientContent(clientId: number): Promise<MunicodeProduct[]> {
  const { products } = await getClientContentWithRaw(clientId);
  return products;
}

/**
 * Get the real, currently-published job for a product — the confirmed,
 * generalizable way to obtain the job_id that municode_get_table_of_contents
 * and municode_get_section_text require. Discovered live (Palm Springs, FL,
 * client 10739, product 12651 → Jobs/latest/12651 → Id: 400865) after
 * Georgetown, KY's job_id (438885) had to be found manually via DevTools —
 * this endpoint is what Municode's own front-end actually calls to resolve
 * that number, and it works from productId alone. This REPLACES the old
 * "job_id_candidate" guesswork (publicationId/Id fallback chain) entirely.
 */
export async function getLatestJob(productId: number): Promise<{ id: number; name: string; isLatest: boolean }> {
  const response = await contentHttp.get<{ Id: number; Name: string; IsLatest: boolean }>(
    `${MUNICODE_CONTENT_API_BASE}/Jobs/latest/${productId}`
  );
  return { id: response.data.Id, name: response.data.Name, isLatest: response.data.IsLatest };
}

/**
 * Generic diagnostic GET against library.municode.com/api, with arbitrary
 * query params. Deliberately scoped ONLY to the content API base (never an
 * arbitrary URL) so it can't be used to hit anything outside Municode's own
 * API. Exists to let experimentation happen live, server-side, without
 * needing another round of manual browser DevTools capture every time an
 * endpoint's exact parameters are uncertain (e.g. /search, which returns
 * 500 with the parameter set copied from the stale reference implementation
 * — real params unconfirmed as of this build).
 */
export async function rawContentApiGet(
  path: string,
  queryParams: Record<string, string | number | boolean>
): Promise<{ status: number; data: unknown }> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  try {
    const response = await contentHttp.get(`${MUNICODE_CONTENT_API_BASE}${cleanPath}`, {
      params: queryParams
    });
    return { status: response.status, data: response.data };
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      return { status: error.response.status, data: error.response.data };
    }
    throw error;
  }
}

/** Get information on a particular product a client subscribes to, by name — confirmed live (Georgetown KY) at the content API base, more precise than filtering the full ClientContent list. */
export async function getProductByName(
  clientId: number,
  productName: string
): Promise<MunicodeProduct> {
  const response = await contentHttp.get<MunicodeProduct>(`${MUNICODE_CONTENT_API_BASE}/Products/name`, {
    params: { clientId, productName }
  });
  return response.data;
}

/** Get the children of a node in a code's table-of-contents tree. */
export async function getTocChildren(
  jobId: number,
  productId: number,
  nodeId: string
): Promise<MunicodeTocNode[]> {
  const response = await contentHttp.get<MunicodeTocNode[]>(`${MUNICODE_CONTENT_API_BASE}/codesToc/children`, {
    params: { jobId, productId, nodeId }
  });
  return response.data;
}

/** Get the actual text content of a specific node (section/chapter/table). */
export async function getCodesContent(
  jobId: number,
  productId: number,
  nodeId: string
): Promise<unknown> {
  const response = await contentHttp.get(`${MUNICODE_CONTENT_API_BASE}/CodesContent`, {
    params: { jobId, productId, nodeId }
  });
  return response.data;
}

/** Full-text search across a jurisdiction's ordinances (MuniDocs search). */
export async function searchMuniDocs(
  clientId: number,
  searchText: string,
  pageNum: number,
  pageSize: number,
  titlesOnly: boolean
): Promise<unknown> {
  const response = await contentHttp.get(`${MUNICODE_CONTENT_API_BASE}/search`, {
    params: {
      clientId,
      searchText,
      pageNum,
      pageSize,
      titlesOnly,
      isAdvanced: false,
      isAutocomplete: false,
      mode: "standard",
      sort: 0,
      fragmentSize: 200,
      contentTypeId: "",
      stateId: 0
    }
  });
  return response.data;
}

/**
 * Resolves a municipality name + state into everything downstream tools
 * need: the ClientID, its list of products, and a CONFIRMED job_id + product
 * match for the "Code of Ordinances" product.
 *
 * Product matching prefers `contentTypeId === "CODES"` (confirmed live
 * field, Georgetown KY client 11590) over name-substring matching, since
 * it's a precise signal rather than a guess. Falls back to matching "code"
 * in the product name if contentTypeId isn't present for some content type.
 *
 * job_id resolution: CONFIRMED as of this fix — once the code product is
 * identified, its real job_id is fetched via GET /Jobs/latest/{productId}
 * (returns { Id, Name, IsLatest, ... }), the same endpoint Municode's own
 * front-end calls. This replaces the earlier "job_id_candidate" guesswork
 * (which tried publicationId, then Id, then productId — none of which were
 * ever actually correct; confirmed wrong on both Georgetown KY, job_id
 * 438885, and Palm Springs FL, job_id 400865, neither of which matched any
 * field on the product list itself).
 */
export async function resolveJurisdiction(
  municipalityName: string,
  stateAbbr: string
): Promise<ResolvedJurisdiction | null> {
  const client = await getClientByName(municipalityName, stateAbbr);
  const clientId = client.ClientID;
  if (!clientId) return null;

  const { products, raw: rawProducts } = await getClientContentWithRaw(clientId);

  let matchedProductId: number | undefined;
  let matchedProductName = "";
  let matchedContentTypeId: string | undefined;

  // Pass 1: precise match on contentTypeId === "CODES".
  for (const p of products) {
    if (p.contentTypeId === "CODES") {
      const productId = p.productId ?? p.ProductID;
      if (productId !== undefined) {
        matchedProductId = productId;
        matchedProductName = p.productName ?? p.ProductName ?? "";
        matchedContentTypeId = p.contentTypeId;
        break;
      }
    }
  }

  // Pass 2: fall back to name-substring matching if no contentTypeId match.
  if (matchedProductId === undefined) {
    for (const p of products) {
      const name = (p.productName ?? p.ProductName ?? "").toLowerCase();
      const productId = p.productId ?? p.ProductID;
      if (name.includes("code") && productId !== undefined) {
        matchedProductId = productId;
        matchedProductName = p.productName ?? p.ProductName ?? "";
        matchedContentTypeId = p.contentTypeId;
        break;
      }
    }
  }

  let codeProduct: ResolvedProduct | null = null;
  if (matchedProductId !== undefined) {
    // Fetch the CONFIRMED job_id — never guessed, always a real API call.
    const latestJob = await getLatestJob(matchedProductId);
    codeProduct = {
      productId: matchedProductId,
      jobId: latestJob.id,
      productName: matchedProductName,
      contentTypeId: matchedContentTypeId
    };
  }

  return {
    clientId,
    clientName: client.ClientName ?? municipalityName,
    stateAbbr,
    city: client.City,
    website: client.Website,
    products,
    codeProduct,
    // Only kept for debugging an empty/unexpected products list — omit
    // when products were parsed normally to avoid bloating every response.
    rawProductsIfEmpty: products.length === 0 ? rawProducts : undefined
  };
}
