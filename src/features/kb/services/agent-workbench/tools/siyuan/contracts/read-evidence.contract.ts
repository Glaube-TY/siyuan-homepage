import { z } from "zod";
import type { AgentScope } from "../../../scope/types";

const SIYUAN_ID = /^\d{14}-[a-z0-9]{7}$/i;

export const readEvidenceInputSchema = z.object({
  blockIds: z.array(z.string().regex(SIYUAN_ID, "blockId 格式无效")).min(1).max(5),
  contextBeforeChars: z.number().int().min(0).max(1000).optional(),
  contextAfterChars: z.number().int().min(0).max(1000).optional(),
  maxCharsPerBlock: z.number().int().min(200).max(4000).optional(),
}).strict();

export type ReadEvidenceInput = z.infer<typeof readEvidenceInputSchema>;

export interface ReadEvidenceItem {
  blockId: string;
  docId: string;
  docTitle: string;
  headingPath: string[];
  content: string;
  contextBefore: string;
  contextAfter: string;
  evidenceChars: number;
  truncated: boolean;
  sourceBlockIds: string[];
}

export interface ReadEvidenceError {
  blockId: string;
  code: "resource_not_found" | "scope_denied" | "doc_id_not_allowed";
  message: string;
}

export interface ReadEvidenceOutput {
  items: ReadEvidenceItem[];
  errors?: ReadEvidenceError[];
  totalEvidenceChars: number;
  note: string;
}

export interface EvidenceDocScopeMeta {
  id: string;
  box: string;
  path: string;
}

export function isEvidenceDocInScope(
  doc: EvidenceDocScopeMeta,
  scope: AgentScope,
  rootDoc?: EvidenceDocScopeMeta,
): boolean {
  switch (scope.type) {
    case "whole_kb": return true;
    case "current_doc": return doc.id === scope.docId;
    case "custom_docs": return scope.docIds.includes(doc.id);
    case "doc_neighborhood": return scope.docIds.includes(doc.id);
    case "notebook": return doc.box === scope.notebookId;
    case "doc_tree": {
      if (doc.id === scope.rootDocId) return true;
      if (!rootDoc || doc.box !== rootDoc.box) return false;
      const rootPathBase = rootDoc.path.replace(/\.sy$/i, "");
      return doc.path.startsWith(`${rootDoc.path}/`) || doc.path.startsWith(`${rootPathBase}/`);
    }
  }
}

export const readEvidenceInputJsonSchemaOverride = {
  type: "object",
  additionalProperties: false,
  properties: {
    blockIds: { type: "array", items: { type: "string", pattern: "^\\d{14}-[a-zA-Z0-9]{7}$" }, minItems: 1, maxItems: 5 },
    contextBeforeChars: { type: "integer", minimum: 0, maximum: 1000 },
    contextAfterChars: { type: "integer", minimum: 0, maximum: 1000 },
    maxCharsPerBlock: { type: "integer", minimum: 200, maximum: 4000 },
  },
  required: ["blockIds"],
} as const;
