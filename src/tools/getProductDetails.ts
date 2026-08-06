import { CHARACTER_LIMIT } from "../constants.js";
import { formatMunicodeError, getProductByName } from "../services/municodeClient.js";
import { ResponseFormat, type GetProductDetailsInput } from "../schemas/index.js";

// This tool exists specifically to solve an open problem: the ClientContent
// list endpoint (used by municode_find_jurisdiction) does not return a
// jurisdiction's real "job ID" — live-observed on Georgetown, KY, where the
// true job_id (438885, needed for municode_get_table_of_contents) was
// neither the product's productId nor its publicationId, and only showed up
// via a direct Products/name call captured in browser DevTools. This tool
// calls that same endpoint server-side and returns the RAW response,
// deliberately unprocessed — the goal is to find which field actually holds
// the real job_id so municode_find_jurisdiction's guessing logic can be
// replaced with a confirmed value instead of a guess.
export async function runGetProductDetails(params: GetProductDetailsInput) {
  let raw: unknown;
  try {
    raw = await getProductByName(params.client_id, params.product_name);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatMunicodeError(error, `product details for client_id=${params.client_id}, product_name="${params.product_name}"`)
        }
      ]
    };
  }

  const output = {
    client_id: params.client_id,
    product_name: params.product_name,
    raw_response: raw
  };

  let text: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    text = [
      `# Raw Product Details — client_id ${params.client_id}, "${params.product_name}"`,
      "",
      "This is the UNPROCESSED response from Municode's Products/name endpoint — no field extraction or guessing applied. Look through it for a field that plausibly holds the real job_id (a large integer, distinct from any productId/publicationId already seen).",
      "",
      "```json",
      JSON.stringify(raw, null, 2),
      "```"
    ].join("\n");
  } else {
    text = JSON.stringify(output, null, 2);
  }

  if (text.length > CHARACTER_LIMIT) {
    text = text.slice(0, CHARACTER_LIMIT) + `\n\n[Truncated at ${CHARACTER_LIMIT} characters.]`;
  }

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: output
  };
}
