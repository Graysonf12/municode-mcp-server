import { CHARACTER_LIMIT } from "../constants.js";
import { formatMunicodeError, getCodesContent } from "../services/municodeClient.js";
import { ResponseFormat, type GetSectionTextInput } from "../schemas/index.js";

// CONFIRMED live shape (Palm Springs, FL, node
// PTIICOOR_CH34LADE_ARTVILAUS_DIV6DIRE_SDVCGCOGE_S34-826PRDERE):
// CodesContent does NOT return a single text/HTML field for the requested
// node. It returns the entire surrounding "chunk group" (the whole
// enclosing Division/Article) as { Docs: [ {Id, Title, Content: "<html>"},
// ... ] } — every section in that group, not just the one asked for. This
// tool now searches that array for the doc whose Id matches the requested
// node_id and extracts ONLY that one's Content, rather than dumping the
// entire surrounding group. The old single-field guess (Content/Html/Text
// at the top level) is kept as a fallback in case some node types return a
// simpler shape.
const CANDIDATE_TEXT_FIELDS = ["Content", "Html", "HtmlContent", "Text", "Body", "content", "html", "text"];
const DOCS_ARRAY_FIELDS = ["Docs", "docs"];

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface CodesContentDoc {
  Id?: string;
  Title?: string;
  Content?: string;
  [key: string]: unknown;
}

/**
 * Finds the specific doc matching the requested node_id inside a Docs-array
 * response. Tries an exact Id match first; if the exact node_id was itself a
 * group heading with no direct content (rare), falls back to concatenating
 * all docs whose Id starts with the requested node_id (its descendants).
 */
function extractFromDocsArray(
  raw: unknown,
  requestedNodeId: string
): { matchedTitle: string | null; text: string | null; totalDocsInGroup: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  let docs: CodesContentDoc[] | null = null;
  for (const field of DOCS_ARRAY_FIELDS) {
    const val = obj[field];
    if (Array.isArray(val)) {
      docs = val as CodesContentDoc[];
      break;
    }
  }
  if (!docs) return null;

  const exact = docs.find((d) => d.Id === requestedNodeId);
  if (exact && exact.Content) {
    return { matchedTitle: exact.Title ?? null, text: stripHtml(exact.Content), totalDocsInGroup: docs.length };
  }

  // Fallback: requested node was a heading with children — concatenate its descendants.
  const descendants = docs.filter((d) => d.Id && d.Id.startsWith(requestedNodeId + "_"));
  if (descendants.length > 0) {
    const combined = descendants
      .map((d) => `## ${d.Title ?? d.Id}\n\n${d.Content ? stripHtml(d.Content) : "(no content)"}`)
      .join("\n\n");
    return { matchedTitle: exact?.Title ?? null, text: combined, totalDocsInGroup: docs.length };
  }

  return { matchedTitle: null, text: null, totalDocsInGroup: docs.length };
}

function extractLikelyText(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const field of CANDIDATE_TEXT_FIELDS) {
      const val = obj[field];
      if (typeof val === "string" && val.length > 0) return val;
    }
  }
  return null;
}

export async function runGetSectionText(params: GetSectionTextInput) {
  let raw: unknown;
  try {
    raw = await getCodesContent(params.job_id, params.product_id, params.node_id);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatMunicodeError(error, `section text for node_id=${params.node_id}`)
        }
      ]
    };
  }

  // Try the confirmed Docs-array shape first (the real, observed shape).
  const docsResult = extractFromDocsArray(raw, params.node_id);
  const plainText = docsResult?.text ?? (() => {
    const likelyHtml = extractLikelyText(raw);
    return likelyHtml ? stripHtml(likelyHtml) : null;
  })();

  const output = {
    job_id: params.job_id,
    product_id: params.product_id,
    node_id: params.node_id,
    matched_title: docsResult?.matchedTitle ?? null,
    extraction_confidence: plainText
      ? docsResult
        ? "matched exact section within the returned chunk group"
        : "matched a likely top-level content field"
      : "unrecognized shape — raw JSON returned",
    text: plainText,
    raw: plainText ? undefined : raw
  };

  let text: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    const lines = [`# Section Text — node ${params.node_id}`, ""];
    if (output.matched_title) lines.push(`**${output.matched_title}**`, "");
    if (plainText) {
      lines.push(plainText);
    } else {
      lines.push(
        "Could not confidently identify this specific section's text within the API response — showing raw JSON below. This means the CodesContent response shape differs from what this tool expected; treat this node's content as unverified and consider cross-checking against library.municode.com directly for this section.",
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
    text = text.slice(0, CHARACTER_LIMIT) + `\n\n[Truncated at ${CHARACTER_LIMIT} characters — this section is long; consider that Municode content is often paginated by sub-node rather than one giant block.]`;
  }

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: output
  };
}
