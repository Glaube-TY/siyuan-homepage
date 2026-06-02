export interface MockToolResultFactory {
  createResult(actionType: string): Record<string, unknown>;
}

export function createDefaultMockToolResultFactory(): MockToolResultFactory {
  return {
    createResult(actionType) {
      switch (actionType) {
        case "list_knowledge_map":
          return {
            returnedNodeCount: 4,
            matchedNodeCount: 1,
            titles: [
              "doc_001",
              "doc_002",
              "doc_003",
              "doc_004",
            ],
          };
        case "focus_doc_scope":
          return {
            focusedDocCount: 4,
            candidateDocCount: 4,
            focusedRootTitle: "doc_001",
          };
        case "search_scope":
          return {
            candidateDocCount: 3,
            candidateBlockCount: 2,
          };
        case "read_candidate_docs":
        case "read_docs":
          return {
            readDocCount: 3,
            evidenceItemCount: 3,
            contentChars: 1200,
            focusedRootTitle: "doc_001",
            readOrder: [
              "doc_001",
              "doc_002",
              "doc_003",
              "doc_004",
            ],
          };
        default:
          return {};
      }
    },
  };
}
