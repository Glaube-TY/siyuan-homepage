export type JsonSchemaObject = Record<string, unknown>;

export function ensureObjectJsonSchema(schema: unknown): JsonSchemaObject {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    const obj = schema as JsonSchemaObject;
    if (obj.type === "object" && obj.properties && typeof obj.properties === "object") {
      return obj;
    }
  }
  return {
    type: "object",
    properties: {},
    additionalProperties: false,
  };
}

