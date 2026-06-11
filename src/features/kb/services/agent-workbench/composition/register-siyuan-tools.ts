/**
 * Composition: register Siyuan-specific tools.
 * All Siyuan tool factory + impl imports live here, not in the composition root.
 */

import { ToolRegistry } from "../registries/tool-registry";
import type { SiyuanToolDeps } from "../tools/siyuan/siyuan-tool-deps";
import {
  createListKnowledgeMapTool,
  type ListKnowledgeMapDeps,
} from "../tools/siyuan/list-knowledge-map.tool";
import {
  createSearchScopeTool,
  type SearchScopeDeps,
} from "../tools/siyuan/search-scope.tool";
import {
  createReadDocsTool,
  type ReadDocsDeps,
} from "../tools/siyuan/read-docs.tool";
import {
  createReadDocBlocksTool,
  type ReadDocBlocksDeps,
} from "../tools/siyuan/read-doc-blocks.tool";
import {
  createUpdateBlockTool,
} from "../tools/siyuan/update-block.tool";
import {
  createInsertBlockTool,
} from "../tools/siyuan/insert-block.tool";
import {
  createDeleteBlockTool,
} from "../tools/siyuan/delete-block.tool";
import {
  createMoveBlockTool,
} from "../tools/siyuan/move-block.tool";
import {
  createCreateDocTool,
} from "../tools/siyuan/create-doc.tool";
import {
  createRenameDocTool,
} from "../tools/siyuan/rename-doc.tool";
import {
  createDeleteDocTool,
} from "../tools/siyuan/delete-doc.tool";
import {
  createReplaceDocContentTool,
} from "../tools/siyuan/replace-doc-content.tool";
import {
  createGetDailyWorkspaceOverviewTool,
  type GetDailyWorkspaceOverviewDeps,
} from "../tools/siyuan/get-daily-workspace-overview.tool";
import {
  createQueryTasksTool,
  type QueryTasksDeps,
} from "../tools/siyuan/query-tasks.tool";
import {
  createQueryDiaryRecordsTool,
  type QueryDiaryRecordsDeps,
} from "../tools/siyuan/query-diary-records.tool";
import {
  createFindDiaryDocsTool,
  type FindDiaryDocsDeps,
} from "../tools/siyuan/find-diary-docs.tool";
import {
  createListDocsByTimeTool,
  type ListDocsByTimeDeps,
} from "../tools/siyuan/list-docs-by-time.tool";
import {
  createGetDocInfoTool,
  type GetDocInfoDeps,
} from "../tools/siyuan/get-doc-info.tool";

// Tool execution implementations
import { executeListKnowledgeMap } from "../tools/siyuan/impl/list-knowledge-map.impl";
import { executeSearchScope } from "../tools/siyuan/impl/search-scope.impl";
import { executeReadDocs } from "../tools/siyuan/impl/read-docs.impl";
import { executeGetDailyWorkspaceOverview } from "../tools/siyuan/impl/get-daily-workspace-overview.impl";
import { executeQueryTasks } from "../tools/siyuan/impl/query-tasks.impl";
import { executeQueryDiaryRecords } from "../tools/siyuan/impl/query-diary-records.impl";
import { executeFindDiaryDocs } from "../tools/siyuan/impl/find-diary-docs.impl";
import { executeReadDocBlocks } from "../tools/siyuan/impl/read-doc-blocks.impl";
import { executeUpdateBlock } from "../tools/siyuan/impl/update-block.impl";
import { executeInsertBlock } from "../tools/siyuan/impl/insert-block.impl";
import { executeDeleteBlock } from "../tools/siyuan/impl/delete-block.impl";
import { executeMoveBlock } from "../tools/siyuan/impl/move-block.impl";
import { executeCreateDoc } from "../tools/siyuan/impl/create-doc.impl";
import { executeRenameDoc } from "../tools/siyuan/impl/rename-doc.impl";
import { executeDeleteDoc } from "../tools/siyuan/impl/delete-doc.impl";
import { executeReplaceDocContent } from "../tools/siyuan/impl/replace-doc-content.impl";
import { executeListDocsByTime } from "../tools/siyuan/impl/list-docs-by-time.impl";
import { executeGetDocInfo } from "../tools/siyuan/impl/get-doc-info.impl";

export interface SiyuanToolRegistrationOptions {
  kbRetrievalToolDeps: SiyuanToolDeps;
  conversationId?: string;
  builtinCapabilityAccess?: {
    knowledgeBase: boolean;
    scheduleTaskDiary: boolean;
    docContentEditing: boolean;
  };
  globalToolAccess?: {
    readDocs: boolean;
    getDocInfo: boolean;
  };
}

function createSiyuanToolDeps(deps: SiyuanToolDeps) {
  const lkmDeps: ListKnowledgeMapDeps = {
    executeListKnowledgeMap: (args) => executeListKnowledgeMap(deps, args),
  };
  const searchDeps: SearchScopeDeps = {
    executeSearchScope: (args) => executeSearchScope(deps, args),
  };
  const readDeps: ReadDocsDeps = {
    executeReadDocs: (args) => executeReadDocs(deps, args),
  };
  const overviewDeps: GetDailyWorkspaceOverviewDeps = {
    executeGetDailyWorkspaceOverview: (args) => executeGetDailyWorkspaceOverview(deps, args),
  };
  const taskDeps: QueryTasksDeps = {
    executeQueryTasks: (args) => executeQueryTasks(deps, args),
  };
  const recordDeps: QueryDiaryRecordsDeps = {
    executeQueryDiaryRecords: (args) => executeQueryDiaryRecords(deps, args),
  };
  const diaryDocDeps: FindDiaryDocsDeps = {
    executeFindDiaryDocs: (args) => executeFindDiaryDocs(deps, args),
  };
  const readDocBlocksDeps: ReadDocBlocksDeps = {
    executeReadDocBlocks: (args) => executeReadDocBlocks(deps, args),
  };
  const listDocsByTimeDeps: ListDocsByTimeDeps = {
    executeListDocsByTime: (args) => executeListDocsByTime(deps, args),
  };
  const getDocInfoDeps: GetDocInfoDeps = {
    executeGetDocInfo: (args) => executeGetDocInfo(deps, args),
  };
  return { lkmDeps, searchDeps, readDeps, overviewDeps, taskDeps, recordDeps, diaryDocDeps, readDocBlocksDeps, listDocsByTimeDeps, getDocInfoDeps };
}

export function registerSiyuanTools(
  toolRegistry: ToolRegistry,
  options: SiyuanToolRegistrationOptions,
): void {
  const deps = options.kbRetrievalToolDeps;
  const {
    lkmDeps, searchDeps, readDeps, overviewDeps,
    taskDeps, recordDeps, diaryDocDeps, readDocBlocksDeps,
    listDocsByTimeDeps, getDocInfoDeps,
  } = createSiyuanToolDeps(deps);

  // read_docs is a global read-only tool
  if (options.globalToolAccess?.readDocs !== false) {
    toolRegistry.ensureTool(createReadDocsTool(readDeps));
  }

  // get_doc_info is a global read-only tool
  if (options.globalToolAccess?.getDocInfo !== false) {
    toolRegistry.ensureTool(createGetDocInfoTool(getDocInfoDeps));
  }

  if (options.builtinCapabilityAccess?.knowledgeBase !== false) {
    toolRegistry.ensureTool(createListKnowledgeMapTool(lkmDeps));
    toolRegistry.ensureTool(createSearchScopeTool(searchDeps));
    toolRegistry.ensureTool(createListDocsByTimeTool(listDocsByTimeDeps));
  }

  if (options.builtinCapabilityAccess?.scheduleTaskDiary !== false) {
    toolRegistry.ensureTool(createGetDailyWorkspaceOverviewTool(overviewDeps));
    toolRegistry.ensureTool(createQueryTasksTool(taskDeps));
    toolRegistry.ensureTool(createQueryDiaryRecordsTool(recordDeps));
    toolRegistry.ensureTool(createFindDiaryDocsTool(diaryDocDeps));
  }

  if (options.builtinCapabilityAccess?.docContentEditing !== false) {
    toolRegistry.ensureTool(createReadDocBlocksTool(readDocBlocksDeps));
    if (options.conversationId) {
      const writeDeps = { ...deps, conversationId: options.conversationId };
      toolRegistry.ensureTool(createUpdateBlockTool({ executeUpdateBlock: (args) => executeUpdateBlock(writeDeps, args) }));
      toolRegistry.ensureTool(createInsertBlockTool({ executeInsertBlock: (args) => executeInsertBlock(writeDeps, args) }));
      toolRegistry.ensureTool(createDeleteBlockTool({ executeDeleteBlock: (args) => executeDeleteBlock(writeDeps, args) }));
      toolRegistry.ensureTool(createMoveBlockTool({ executeMoveBlock: (args) => executeMoveBlock(writeDeps, args) }));
      toolRegistry.ensureTool(createCreateDocTool({ executeCreateDoc: (args) => executeCreateDoc(writeDeps, args) }));
      toolRegistry.ensureTool(createRenameDocTool({ executeRenameDoc: (args) => executeRenameDoc(writeDeps, args) }));
      toolRegistry.ensureTool(createDeleteDocTool({ executeDeleteDoc: (args) => executeDeleteDoc(writeDeps, args) }));
      toolRegistry.ensureTool(createReplaceDocContentTool({ executeReplaceDocContent: (args) => executeReplaceDocContent(writeDeps, args) }));
    }
  }
}
