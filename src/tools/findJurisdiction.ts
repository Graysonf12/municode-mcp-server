import { CHARACTER_LIMIT } from "../constants.js";
import { formatMunicodeError, resolveJurisdiction } from "../services/municodeClient.js";
import { ResponseFormat, type FindJurisdictionInput } from "../schemas/index.js";

export async function runFindJurisdiction(params: FindJurisdictionInput) {
  let resolved;
  try {
    resolved = await resolveJurisdiction(params.municipality_name, params.state_abbr);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatMunicodeError(error, `looking up ${params.municipality_name}, ${params.state_abbr}`)
        }
      ]
    };
  }

  if (!resolved) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No Municode jurisdiction matched "${params.municipality_name}" in ${params.state_abbr}. This jurisdiction may not use Municode at all (check amlegal.com or the county's own site next per the Setback Retrieval Routine's retrieval path order), or the name may need to match Municode's library naming more closely — try the name exactly as it appears in a library.municode.com URL for this jurisdiction if you have one.`
        }
      ]
    };
  }

  const output = {
    client_id: resolved.clientId,
    client_name: resolved.clientName,
    state_abbr: resolved.stateAbbr,
    city: resolved.city ?? null,
    website: resolved.website ?? null,
    products: resolved.products.map((p) => ({
      job_id: p.Id ?? null,
      product_id: p.ProductID ?? null,
      product_name: p.ProductName ?? null
    })),
    likely_code_of_ordinances: resolved.codeProduct
      ? {
          job_id: resolved.codeProduct.jobId,
          product_id: resolved.codeProduct.productId,
          product_name: resolved.codeProduct.productName
        }
      : null,
    note: resolved.codeProduct
      ? "Use likely_code_of_ordinances' job_id/product_id with municode_get_table_of_contents to browse chapters, or with municode_search_ordinances (using client_id) to search directly."
      : resolved.products.length === 0
        ? "Zero products returned for this jurisdiction. This can mean the jurisdiction genuinely has no code products on Municode, OR that Municode's API returned an unrecognized/empty response shape for this client_id (a known live-observed quirk — see server README). Before concluding this jurisdiction has no Municode code, spot-check library.municode.com directly for this jurisdiction. The raw_products_response field below shows exactly what Municode's API returned for this client_id — inspect it for a wrapper field name this tool doesn't yet recognize."
        : "No product with 'code' in its name was found automatically — inspect the full products list and pick the right job_id/product_id manually (e.g. a jurisdiction may call it 'Zoning Ordinance' or 'Land Development Code' instead).",
    raw_products_response: resolved.rawProductsIfEmpty ?? undefined
  };

  let text: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    const lines: string[] = [];
    lines.push(`# Municode Jurisdiction Lookup — ${output.client_name}, ${output.state_abbr}`);
    lines.push("");
    lines.push(`**Client ID:** ${output.client_id}`);
    if (output.city) lines.push(`**City:** ${output.city}`);
    if (output.website) lines.push(`**Website:** ${output.website}`);
    lines.push("");
    lines.push(`## Available code products (${output.products.length})`);
    for (const p of output.products) {
      lines.push(`- **${p.product_name ?? "(unnamed)"}** — job_id: ${p.job_id}, product_id: ${p.product_id}`);
    }
    lines.push("");
    if (output.likely_code_of_ordinances) {
      lines.push(
        `**Best-guess Code of Ordinances:** "${output.likely_code_of_ordinances.product_name}" (job_id: ${output.likely_code_of_ordinances.job_id}, product_id: ${output.likely_code_of_ordinances.product_id})`
      );
    }
    lines.push("");
    lines.push(output.note);
    if (output.raw_products_response !== undefined) {
      lines.push("");
      lines.push("**Raw API response for this client's products (for debugging the empty result):**");
      lines.push("```json");
      lines.push(JSON.stringify(output.raw_products_response, null, 2));
      lines.push("```");
    }
    text = lines.join("\n");
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
