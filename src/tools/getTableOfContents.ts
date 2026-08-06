import { CHARACTER_LIMIT, DEFAULT_ROOT_NODE_ID } from "../constants.js";
import { formatMunicodeError, getTocChildren } from "../services/municodeClient.js";
import { ResponseFormat, type GetTableOfContentsInput } from "../schemas/index.js";

export async function runGetTableOfContents(params: GetTableOfContentsInput) {
  const nodeId = params.node_id ?? DEFAULT_ROOT_NODE_ID;

  let nodes;
  try {
    nodes = await getTocChildren(params.job_id, params.product_id, nodeId);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatMunicodeError(error, `table of contents for job_id=${params.job_id}, node_id=${nodeId}`)
        }
      ]
    };
  }

  const output = {
    job_id: params.job_id,
    product_id: params.product_id,
    node_id: nodeId,
    child_count: nodes.length,
    children: nodes.map((n) => ({ id: n.Id ?? null, heading: n.Heading ?? null }))
  };

  let text: string;
  if (params.response_format === ResponseFormat.MARKDOWN) {
    const lines = [
      `# Table of Contents — node ${nodeId}`,
      "",
      `${output.child_count} item(s) at this level.`,
      ""
    ];
    if (!output.child_count) {
      lines.push(
        "No children returned — this may be a leaf node (use municode_get_section_text with this node_id to read its content), or the node_id may be wrong."
      );
    }
    for (const c of output.children) {
      lines.push(`- **${c.heading ?? "(untitled)"}** — node_id: \`${c.id}\``);
    }
    lines.push("");
    lines.push(
      "To go deeper, call this tool again with one of the node_id values above. To read a section's actual text, use municode_get_section_text with its node_id."
    );
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
