import axios, { AxiosError } from "axios";
import { MUNICODE_API_BASE, REQUEST_TIMEOUT_MS } from "../constants.js";
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
// (Georgetown, KY) returned a non-array shape that crashed a naive
// `for...of` loop. Never assume this endpoint's shape without checking.
const PRODUCTS_WRAPPER_FIELDS = ["Products", "products", "Items", "items", "Content", "content"];

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

/** Get the children of a node in a code's table-of-contents tree. */
export async function getTocChildren(
  jobId: number,
  productId: number,
  nodeId: string
): Promise<MunicodeTocNode[]> {
  const response = await http.get<MunicodeTocNode[]>(`${MUNICODE_API_BASE}/codesToc/children`, {
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
  const response = await http.get(`${MUNICODE_API_BASE}/CodesContent`, {
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
  const response = await http.get(`${MUNICODE_API_BASE}/search`, {
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
 * need: the ClientID, its list of products, and a best-guess match for
 * the "Code of Ordinances" product (the one whose name contains "code",
 * case-insensitive — the same heuristic the reference implementation
 * uses, since Municode doesn't tag a single canonical product type).
 * A jurisdiction with a separate "Zoning Ordinance" product will still
 * list it in `products` even if it isn't picked as `codeProduct`.
 */
export async function resolveJurisdiction(
  municipalityName: string,
  stateAbbr: string
): Promise<ResolvedJurisdiction | null> {
  const client = await getClientByName(municipalityName, stateAbbr);
  const clientId = client.ClientID;
  if (!clientId) return null;

  const { products, raw: rawProducts } = await getClientContentWithRaw(clientId);

  let codeProduct: ResolvedProduct | null = null;
  for (const p of products) {
    const name = (p.ProductName ?? "").toLowerCase();
    if (name.includes("code") && p.Id !== undefined && p.ProductID !== undefined) {
      codeProduct = { jobId: p.Id, productId: p.ProductID, productName: p.ProductName ?? "" };
      break;
    }
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
