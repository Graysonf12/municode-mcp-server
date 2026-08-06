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
      product_name: p.productName ?? p.ProductName ?? null,
      product_id: p.productId ?? p.ProductID ?? null,
      publication_id: p.publicationId ?? null,
      content_type_id: p.contentTypeId ?? null
    })),
    likely_code_of_ordinances: resolved.codeProduct
      ? {
          product_id: resolved.codeProduct.productId,
          job_id: resolved.codeProduct.jobId,
          product_name: resolved.codeProduct.productName,
          content_type_id: resolved.codeProduct.contentTypeId ?? null
        }
      : null,
    note: resolved.codeProduct
      ? "job_id is CONFIRMED (fetched live via /Jobs/latest) — pass product_id and job_id directly to municode_get_table_of_contents or municode_get_section_text."
      : resolved.products.length === 0
        ? "Zero products returned for this jurisdiction. This can mean the jurisdiction genuinely has no code products on Municode, OR that Municode's API returned an unrecognized/empty response shape for this client_id (a known live-observed quirk — see server README). Before concluding this jurisdiction has no Municode code, spot-check library.municode.com directly for this jurisdiction. The raw_products_response field below shows exactly what Municode's API returned for this client_id — inspect it for a wrapper field name this tool doesn't yet recognize."
        : "No product matched by contentTypeId='CODES' or by 'code' in its name — inspect the full products list and pick the right product_id manually (e.g. a jurisdiction may call it 'Zoning Ordinance' or 'Land Development Code' instead).",
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
      lines.push(
        `- **${p.product_name ?? "(unnamed)"}** — product_id: ${p.product_id}, publication_id: ${p.publication_id}${p.content_type_id ? `, content_type: ${p.content_type_id}` : ""}`
      );
    }
    lines.push("");
    if (output.likely_code_of_ordinances) {
      lines.push(
        `**Code of Ordinances:** "${output.likely_code_of_ordinances.product_name}" (product_id: ${output.likely_code_of_ordinances.product_id}, job_id: ${output.likely_code_of_ordinances.job_id})`
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
