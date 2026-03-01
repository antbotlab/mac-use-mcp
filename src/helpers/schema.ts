import type { ZodObject, ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Convert a Zod object schema to a JSON Schema compatible with the MCP Tool
 * inputSchema type.
 *
 * zodToJsonSchema returns a broad union type, but z.object() always produces
 * `{ type: "object", ... }` at runtime. This helper narrows the type.
 */
export function zodToToolInputSchema(
  schema: ZodObject<ZodRawShape>,
): Tool["inputSchema"] {
  return zodToJsonSchema(schema) as Tool["inputSchema"];
}
