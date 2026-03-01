import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Convert a Zod object schema to a JSON Schema compatible with the MCP Tool
 * inputSchema type.
 *
 * Uses zod 4's native toJSONSchema with draft-07 target for MCP compatibility.
 */
export function zodToToolInputSchema(
  schema: z.ZodObject<z.ZodRawShape>,
): Tool["inputSchema"] {
  return z.toJSONSchema(schema, { target: "draft-07" }) as Tool["inputSchema"];
}
