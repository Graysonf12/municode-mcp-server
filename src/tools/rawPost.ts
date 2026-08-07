import { CHARACTER_LIMIT } from "../constants.js";
import { rawContentApiPost } from "../services/municodeClient.js";
import { ResponseFormat, type RawPostInput } from "../schemas/index.js";

// Same rationale as rawGet.ts, but for POST — added specifically to test
// whether /search (and possibly other endpoints) are actually POST routes
// expecting a JSON body, not GET routes with query params. The ASP.NET
// backend (confirmed via X-Powered-By header in live captures) commonly
// returns exactly the failure pattern seen on GET /search — HTTP 500, empty
// body — when a GET hits a POST-only route.
export async function runRawPost(params: RawPostInput) {
  let result: { status: number; data: unknown };
  try {
    result = await rawContentApiPost(params.path, params.body);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Request failed before a response was received: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }

  const output = {
    path: params.path,
    body: params.body,
    status: result.status,
    data: result.data
  };

  let text: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    text = [
      `# Raw POST ${params.path}`,
      "",
      `Body: \`${JSON.stringify(params.body)}\``,
      `HTTP status: ${result.status}`,
      "",
      "```json",
      JSON.stringify(result.data, null, 2),
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
