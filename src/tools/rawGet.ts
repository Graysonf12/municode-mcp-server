import { CHARACTER_LIMIT } from "../constants.js";
import { rawContentApiGet } from "../services/municodeClient.js";
import { ResponseFormat, type RawGetInput } from "../schemas/index.js";

// General-purpose diagnostic tool: lets an agent experiment with
// library.municode.com/api endpoints directly, trying different parameter
// combinations without needing a human to capture browser DevTools traffic
// each time. Scoped only to that one API base (see rawContentApiGet) —
// cannot be used to reach arbitrary URLs. Returns the real HTTP status and
// body every time, including on error responses, so failed guesses are
// still informative rather than opaque.
export async function runRawGet(params: RawGetInput) {
  let result: { status: number; data: unknown };
  try {
    result = await rawContentApiGet(params.path, params.query_params);
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
    query_params: params.query_params,
    status: result.status,
    data: result.data
  };

  let text: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    text = [
      `# Raw GET ${params.path}`,
      "",
      `Query params: \`${JSON.stringify(params.query_params)}\``,
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
