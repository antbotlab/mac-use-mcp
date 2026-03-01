import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToToolInputSchema } from "../../helpers/schema.js";

describe("zodToToolInputSchema", () => {
  it("converts a basic schema to JSON Schema with type object", () => {
    const schema = z.object({
      name: z.string(),
    });
    const result = zodToToolInputSchema(schema);

    expect(result.type).toBe("object");
    expect(result).toHaveProperty("properties");
  });

  it("marks required fields", () => {
    const schema = z.object({
      required_field: z.string(),
      optional_field: z.string().optional(),
    });
    const result = zodToToolInputSchema(schema);

    expect(result).toHaveProperty("required");
    const required = (result as Record<string, unknown>).required as string[];
    expect(required).toContain("required_field");
    expect(required).not.toContain("optional_field");
  });

  it("includes default values in schema", () => {
    const schema = z.object({
      amount: z.number().default(42),
    });
    const result = zodToToolInputSchema(schema);
    const props = (result as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(props.amount.default).toBe(42);
  });

  it("handles enum fields", () => {
    const schema = z.object({
      direction: z.enum(["up", "down"]),
    });
    const result = zodToToolInputSchema(schema);
    const props = (result as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(props.direction.enum).toEqual(["up", "down"]);
  });

  it("handles nested object constraints", () => {
    const schema = z.object({
      x: z.number().int().min(0).max(100),
    });
    const result = zodToToolInputSchema(schema);
    const props = (result as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(props.x.type).toBe("integer");
    expect(props.x.minimum).toBe(0);
    expect(props.x.maximum).toBe(100);
  });
});
