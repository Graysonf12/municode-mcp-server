import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  FindJurisdictionInputSchema,
  GetProductDetailsInputSchema,
  GetSectionTextInputSchema,
  GetTableOfContentsInputSchema,
  RawGetInputSchema,
  RawPostInputSchema,
  SearchOrdinancesInputSchema
} from "./schemas/index.js";
import { runFindJurisdiction } from "./tools/findJurisdiction.js";
import { runGetTableOfContents } from "./tools/getTableOfContents.js";
import { runGetSectionText } from "./tools/getSectionText.js";
import { runSearchOrdinances } from "./tools/searchOrdinances.js";
import { runGetProductDetails } from "./tools/getProductDetails.js";
import { runRawGet } from "./tools/rawGet.js";
import { runRawPost } from "./tools/rawPost.js";

/**
 * Builds a fresh, fully-configured McpServer instance. See the FEMA NFHL
 * server for the reasoning behind building one per request in stateless
 * HTTP mode (index.ts) — same pattern here, same rationale (safe on
 * free-tier hosts that spin the process down between requests).
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "municode-mcp-server",
    version: "1.0.0"
  });

  server.registerTool(
    "municode_find_jurisdiction",
    {
      title: "Find Municode Jurisdiction",
      description: `Look up a municipality or county in Municode's library by name and state, and list its available code products (Code of Ordinances, Zoning Ordinance, etc.) with the IDs needed for the other tools in this server.

This is unofficial, reverse-engineered access to the same JSON API that library.municode.com's own single-page app calls — it exists because the library site itself is JS-rendered and returns nothing useful to a direct fetch. If this jurisdiction doesn't use Municode, or the name doesn't match, this call will say so rather than guessing.

Args:
  - municipality_name (string): e.g. "Jefferson County", "Indian River County", "Wildwood". Matching is somewhat exact — if it fails, try the name as it appears in a library.municode.com URL for this jurisdiction.
  - state_abbr (string): two-letter state code, e.g. "KY", "FL".
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: the jurisdiction's Client ID, its list of code products with job_id/product_id pairs, and the CONFIRMED job_id/product_id for the primary Code of Ordinances product (fetched live via Municode's own /Jobs/latest endpoint — not a guess). Use the returned job_id/product_id with municode_get_table_of_contents or municode_get_section_text, and client_id with municode_search_ordinances.

Always call this first — every other tool in this server needs IDs this tool returns.`,
      inputSchema: FindJurisdictionInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => runFindJurisdiction(params)
  );

  server.registerTool(
    "municode_get_table_of_contents",
    {
      title: "Get Municode Table of Contents",
      description: `Browse the chapter/section structure of a jurisdiction's code, one level at a time. Use this to walk down to a specific chapter or table before reading its text — mirrors the Setback Retrieval Routine's "name the exact chapter/table" step.

Args:
  - job_id, product_id (integers): from municode_find_jurisdiction's output.
  - node_id (string, optional): the parent node to list children of. Omit to start at the root (top-level titles/chapters).
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: the child nodes at that level, each with a node_id and heading. Call again with a child's node_id to go deeper, or pass a node_id to municode_get_section_text once you've found the right one.`,
      inputSchema: GetTableOfContentsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => runGetTableOfContents(params)
  );

  server.registerTool(
    "municode_get_section_text",
    {
      title: "Get Municode Section Text",
      description: `Retrieve the actual text content of a specific code section, once you know its node_id (from municode_get_table_of_contents or municode_search_ordinances).

Args:
  - job_id, product_id (integers): from municode_find_jurisdiction's output.
  - node_id (string): the specific section/chapter/table to read.
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: the section's text, HTML-stripped to plain readable text where the response shape is recognized. Note: this endpoint's exact response shape has not been confirmed against a live call as of this build (see server README) — if the shape is unrecognized, this tool returns the raw JSON instead of silently dropping data, and says so explicitly. Does NOT solve graphics-embedded/scanned tables — if a dimensional table was a scanned image in the original PDF, Municode's own copy is likely the same image, and the §0B upload/rasterize path is still needed for that specific table.`,
      inputSchema: GetSectionTextInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => runGetSectionText(params)
  );

  server.registerTool(
    "municode_search_ordinances",
    {
      title: "Search Municode Ordinances",
      description: `Full-text search across a jurisdiction's ordinances for a word or phrase — faster than browsing the table of contents when you know roughly what you're looking for (e.g. "car wash", "drive-through", "setback").

Args:
  - client_id (integer): from municode_find_jurisdiction's output.
  - search_text (string): word or phrase to search for.
  - page_size, page_number (integers, optional): pagination, default 10/1.
  - titles_only (boolean, optional): restrict to section headings only, default false.
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: matching sections with title, snippet, and node_id — feed a result's node_id into municode_get_section_text to read the full section. Note: this endpoint's exact response shape has not been confirmed against a live call as of this build — if unrecognized, raw JSON is returned instead of dropped results.`,
      inputSchema: SearchOrdinancesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => runSearchOrdinances(params)
  );

  server.registerTool(
    "municode_get_product_details_raw",
    {
      title: "Get Raw Municode Product Details (diagnostic)",
      description: `DIAGNOSTIC TOOL: calls Municode's Products/name endpoint directly and returns the completely unprocessed raw response. Exists to solve a known open problem — municode_find_jurisdiction's job_id_candidate field is a best-effort guess that is NOT reliably correct (confirmed wrong on at least one live jurisdiction). This tool lets you inspect the raw Products/name response to find whichever field actually holds the real job_id needed by municode_get_table_of_contents and municode_get_section_text.

Args:
  - client_id (integer): from municode_find_jurisdiction's output.
  - product_name (string): exactly as it appeared in municode_find_jurisdiction's products list, e.g. "Code of Ordinances".
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: the complete raw JSON response, no extraction applied. Use this when municode_get_table_of_contents 404s on every job_id guess.`,
      inputSchema: GetProductDetailsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => runGetProductDetails(params)
  );

  server.registerTool(
    "municode_raw_get",
    {
      title: "Raw GET Against Municode Content API (diagnostic)",
      description: `DIAGNOSTIC TOOL: makes a direct GET request to any path under library.municode.com/api, with any query parameters, and returns the raw HTTP status and response body — even on error responses. Use this to experiment when another tool is failing (e.g. a 500 or 404) and the exact required parameters are uncertain, instead of needing a human to capture browser DevTools traffic.

Args:
  - path (string): path relative to library.municode.com/api, e.g. "/search" or "/codesToc/children".
  - query_params (object): key-value query string parameters, e.g. { clientId: 10739, searchText: "parking" }.
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: the real HTTP status code and full response body, whatever it is — including error responses, so a failed guess is still informative. Scoped only to library.municode.com/api; cannot reach any other URL.`,
      inputSchema: RawGetInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => runRawGet(params)
  );

  server.registerTool(
    "municode_raw_post",
    {
      title: "Raw POST Against Municode Content API (diagnostic)",
      description: `DIAGNOSTIC TOOL: makes a direct POST request with a JSON body to any path under library.municode.com/api, and returns the raw HTTP status and response body — even on error responses. Use this when municode_raw_get returns an empty-body 500, since that pattern (on this ASP.NET backend) often means the route actually expects POST with a JSON body, not GET with query params.

Args:
  - path (string): path relative to library.municode.com/api, e.g. "/search".
  - body (object): JSON body to send, e.g. { clientId: 10739, searchText: "parking" }.
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: the real HTTP status code and full response body. Scoped only to library.municode.com/api.`,
      inputSchema: RawPostInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params) => runRawPost(params)
  );

  return server;
}
