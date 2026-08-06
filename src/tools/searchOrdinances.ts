import { CHARACTER_LIMIT } from "../constants.js";
import { formatMunicodeError, searchMuniDocs } from "../services/municodeClient.js";
import { ResponseFormat, type SearchOrdinancesInput } from "../schemas/index.js";

// Same caveat as getSectionText.ts: the search response's exact field
// names aren't confirmed against a live call. This makes a best-effort
// attempt to find a results array and common title/snippet/node-id fields
// among several candidate names, and always includes the raw response so
// nothing is lost if the guess is wrong.
const RESULTS_ARRAY_FIELDS = ["Results", "results", "Items", "items", "Hits", "hits", "Documents", "documents"];
const TITLE_FIELDS = ["Title", "title", "Heading", "heading", "Name", "name"];
const SNIPPET_FIELDS = ["Snippet", "snippet", "Fragment", "fragment", "Highlight", "highlight", "Excerpt", "excerpt"];
const NODE_ID_FIELDS = ["NodeId", "nodeId", "Id", "id"];

function firstStringField(obj: Record<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    const val = obj[key];
    if (typeof val === "string" && val.length > 0) return val;
    if (typeof val === "number") return String(val);
  }
  return null;
}

function extractResultsArray(raw: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const field of RESULTS_ARRAY_FIELDS) {
      const val = obj[field];
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
  }
  return null;
}

export async function runSearchOrdinances(params: SearchOrdinancesInput) {
  let raw: unknown;
  try {
    raw = await searchMuniDocs(
      params.client_id,
      params.search_text,
      params.page_number,
      params.page_size,
      params.titles_only
    );
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatMunicodeError(error, `search "${params.search_text}" (client_id=${params.client_id})`)
        }
      ]
    };
  }

  const resultsArray = extractResultsArray(raw);

  const output = {
    client_id: params.client_id,
    search_text: params.search_text,
    page_number: params.page_number,
    page_size: params.page_size,
    extraction_confidence: resultsArray ? "matched a likely results array" : "unrecognized shape — raw JSON returned",
    result_count: resultsArray?.length ?? null,
    results: resultsArray?.map((r) => ({
      title: firstStringField(r, TITLE_FIELDS),
      snippet: firstStringField(r, SNIPPET_FIELDS),
      node_id: firstStringField(r, NODE_ID_FIELDS)
    })),
    raw: resultsArray ? undefined : raw
  };

  let text: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    const lines = [`# Municode Search — "${params.search_text}"`, ""];
    if (output.results) {
      lines.push(`${output.result_count} result(s) on page ${params.page_number}:`, "");
      for (const r of output.results) {
        lines.push(`- **${r.title ?? "(untitled)"}**${r.node_id ? ` — node_id: \`${r.node_id}\`` : ""}`);
        if (r.snippet) lines.push(`  ${r.snippet}`);
      }
      lines.push("", "Use a result's node_id with municode_get_section_text to read the full section.");
    } else {
      lines.push(
        "Could not confidently identify a results array in the API response — showing raw JSON below.",
        "",
        "```json",
        JSON.stringify(raw, null, 2),
        "```"
      );
    }
    text = lines.join("\n");
  } else {
    text = JSON.stringify(output, null, 2);
  }

  if (text.length > CHARACTER_LIMIT) {
    text = text.slice(0, CHARACTER_LIMIT) + `\n\n[Truncated at ${CHARACTER_LIMIT} characters — reduce page_size or narrow search_text.]`;
  }

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: output
  };
}
