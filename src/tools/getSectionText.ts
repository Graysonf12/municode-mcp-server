import { CHARACTER_LIMIT } from "../constants.js";
import { formatMunicodeError, getCodesContent } from "../services/municodeClient.js";
import { ResponseFormat, type GetSectionTextInput } from "../schemas/index.js";

// The CodesContent endpoint's exact response shape is NOT confirmed against
// a live response (see municodeClient.ts header note) — the reference
// implementation this was built from simply JSON-dumps whatever comes back
// without asserting a schema. This tool makes a best-effort attempt to find
// a plausible HTML/text field among common candidate names and strip tags
// for a readable result; if none match, it falls back to showing the raw
// JSON so nothing is silently dropped. Confirm the real shape on first live
// call and tighten this extraction once observed.
const CANDIDATE_TEXT_FIELDS = ["Content", "Html", "HtmlContent", "Text", "Body", "content", "html", "text"];

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

  const likelyHtml = extractLikelyText(raw);
  const plainText = likelyHtml ? stripHtml(likelyHtml) : null;

  const output = {
    job_id: params.job_id,
    product_id: params.product_id,
    node_id: params.node_id,
    extraction_confidence: plainText ? "matched a likely content field" : "unrecognized shape — raw JSON returned",
    text: plainText,
    raw: plainText ? undefined : raw
  };

  let text: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    const lines = [`# Section Text — node ${params.node_id}`, ""];
    if (plainText) {
      lines.push(plainText);
    } else {
      lines.push(
        "Could not confidently identify a text/HTML field in the API response for this node — showing raw JSON below. This means the CodesContent response shape differs from what this tool expected; treat this node's content as unverified and consider cross-checking against library.municode.com directly for this section.",
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
