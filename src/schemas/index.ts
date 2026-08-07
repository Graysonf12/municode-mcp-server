import { z } from "zod";

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe(
    "Output format: 'markdown' for a human-readable summary (default) or 'json' for the full structured data."
  );

const StateAbbrSchema = z
  .string()
  .length(2)
  .describe("Two-character US state abbreviation, e.g. 'KY', 'FL', 'TN'.");

export const FindJurisdictionInputSchema = z
  .object({
    municipality_name: z
      .string()
      .min(1)
      .describe(
        "Name of the city, county, or municipality as it appears in Municode's library — e.g. 'Jefferson County', 'Indian River County', 'Wildwood'. Matching is done server-side by Municode's own client-name lookup, which is somewhat exact-match sensitive; if a lookup fails, try the name exactly as it appears in the municode.com library URL (e.g. 'library.municode.com/ky/jefferson_county' -> 'Jefferson County')."
      ),
    state_abbr: StateAbbrSchema,
    response_format: ResponseFormatSchema
  })
  .strict();
export type FindJurisdictionInput = z.infer<typeof FindJurisdictionInputSchema>;

export const GetTableOfContentsInputSchema = z
  .object({
    job_id: z
      .number()
      .int()
      .describe("The jobId for the target code product — obtained from municode_find_jurisdiction's output."),
    product_id: z
      .number()
      .int()
      .describe("The productId for the target code product — obtained from municode_find_jurisdiction's output."),
    node_id: z
      .string()
      .optional()
      .describe(
        "The parent node ID to list children for. Omit to start at the root of the code (top-level chapters/titles)."
      ),
    response_format: ResponseFormatSchema
  })
  .strict();
export type GetTableOfContentsInput = z.infer<typeof GetTableOfContentsInputSchema>;

export const GetSectionTextInputSchema = z
  .object({
    job_id: z.number().int().describe("The jobId for the target code product."),
    product_id: z.number().int().describe("The productId for the target code product."),
    node_id: z
      .string()
      .min(1)
      .describe(
        "The specific node ID to retrieve the text content of — obtained from municode_get_table_of_contents or municode_search_ordinances."
      ),
    response_format: ResponseFormatSchema
  })
  .strict();
export type GetSectionTextInput = z.infer<typeof GetSectionTextInputSchema>;

export const SearchOrdinancesInputSchema = z
  .object({
    client_id: z
      .number()
      .int()
      .describe("The ClientID for the jurisdiction to search within — obtained from municode_find_jurisdiction's output."),
    search_text: z.string().min(1).describe("Text or phrase to search for across the jurisdiction's ordinances."),
    page_size: z.number().int().min(1).max(50).default(10).describe("Number of results per page."),
    page_number: z.number().int().min(1).default(1).describe("Page number to retrieve."),
    titles_only: z.boolean().default(false).describe("Restrict the search to section titles/headings only."),
    response_format: ResponseFormatSchema
  })
  .strict();
export type SearchOrdinancesInput = z.infer<typeof SearchOrdinancesInputSchema>;

export const GetProductDetailsInputSchema = z
  .object({
    client_id: z
      .number()
      .int()
      .describe("The ClientID for the jurisdiction — obtained from municode_find_jurisdiction's output."),
    product_name: z
      .string()
      .min(1)
      .describe(
        "The product's name exactly as returned by municode_find_jurisdiction's products list, e.g. 'Code of Ordinances'."
      ),
    response_format: ResponseFormatSchema
  })
  .strict();
export type GetProductDetailsInput = z.infer<typeof GetProductDetailsInputSchema>;

export const RawGetInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .describe(
        "Path relative to library.municode.com/api, e.g. '/search' or '/codesToc/children'. Leading slash optional."
      ),
    query_params: z
      .record(z.union([z.string(), z.number(), z.boolean()]))
      .default({})
      .describe("Query string parameters as key-value pairs, e.g. { clientId: 10739, searchText: 'parking' }."),
    response_format: ResponseFormatSchema
  })
  .strict();
export type RawGetInput = z.infer<typeof RawGetInputSchema>;

export const RawPostInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .describe("Path relative to library.municode.com/api, e.g. '/search'. Leading slash optional."),
    body: z
      .record(z.unknown())
      .default({})
      .describe("JSON body to send, e.g. { clientId: 10739, searchText: 'parking' }."),
    response_format: ResponseFormatSchema
  })
  .strict();
export type RawPostInput = z.infer<typeof RawPostInputSchema>;
