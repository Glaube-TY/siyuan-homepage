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
  createDeleteBlocksTool,
} from "../tools/siyuan/delete-blocks.tool";
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
  createListItemsByTimeTool,
  type ListItemsByTimeDeps,
} from "../tools/siyuan/list-items-by-time.tool";
import {
  createGetDocInfoTool,
  type GetDocInfoDeps,
} from "../tools/siyuan/get-doc-info.tool";
import {
  createListAttributeViewsTool,
  type ListAttributeViewsDeps,
} from "../tools/siyuan/list-attribute-views.tool";
import {
  createReadAttributeViewTool,
  type ReadAttributeViewDeps,
} from "../tools/siyuan/read-attribute-view.tool";
import {
  createFindAttributeViewRowsTool,
  type FindAttributeViewRowsDeps,
} from "../tools/siyuan/find-attribute-view-rows.tool";
import {
  createUpdateAttributeViewCellTool,
  type UpdateAttributeViewCellDeps,
} from "../tools/siyuan/update-attribute-view-cell.tool";
import {
  createAddAttributeViewRowsTool,
  type AddAttributeViewRowsDeps,
} from "../tools/siyuan/add-attribute-view-rows.tool";
import {
  createAddAttributeViewKeyTool,
  type AddAttributeViewKeyDeps,
} from "../tools/siyuan/add-attribute-view-key.tool";
import {
  createRemoveAttributeViewKeyTool,
  type RemoveAttributeViewKeyDeps,
} from "../tools/siyuan/remove-attribute-view-key.tool";
import {
  createRemoveAttributeViewRowsTool,
  type RemoveAttributeViewRowsDeps,
} from "../tools/siyuan/remove-attribute-view-rows.tool";
import {
  createClearAttributeViewCellTool,
  type ClearAttributeViewCellDeps,
} from "../tools/siyuan/clear-attribute-view-cell.tool";
import {
  createManageDiaryStructureTool,
  type ManageDiaryStructureDeps,
} from "../tools/siyuan/manage-diary-structure.tool";
import {
  createManageDiaryTaskTool,
  type ManageDiaryTaskDeps,
} from "../tools/siyuan/manage-diary-task.tool";
import {
  createManageDiaryRecordTool,
  type ManageDiaryRecordDeps,
} from "../tools/siyuan/manage-diary-record.tool";
import {
  createManageDiaryReviewTool,
  type ManageDiaryReviewDeps,
} from "../tools/siyuan/manage-diary-review.tool";
import { createSiyuanOutlineTool, type SiyuanOutlineDeps } from "../tools/siyuan/siyuan-outline.tool";
import { createSiyuanRefTool, type SiyuanRefDeps } from "../tools/siyuan/siyuan-ref.tool";
import { createSiyuanSearchExtraTool, type SiyuanSearchExtraDeps } from "../tools/siyuan/siyuan-search-extra.tool";
import { createSiyuanSqlSelectTool, type SiyuanSqlSelectDeps } from "../tools/siyuan/siyuan-sql-select.tool";
import { createSiyuanBlockReadTool, type SiyuanBlockReadDeps } from "../tools/siyuan/siyuan-block-read.tool";
import { createSiyuanBlockAttrTool, type SiyuanBlockAttrDeps } from "../tools/siyuan/siyuan-block-attr.tool";
import { createSiyuanBlockRefTool, type SiyuanBlockRefDeps } from "../tools/siyuan/siyuan-block-ref.tool";
import { createSiyuanBlockStateTool, type SiyuanBlockStateDeps } from "../tools/siyuan/siyuan-block-state.tool";
import { createSiyuanDocTransformTool, type SiyuanDocTransformDeps } from "../tools/siyuan/siyuan-doc-transform.tool";
import { createSiyuanDatabaseExtraReadTool, type SiyuanDatabaseExtraReadDeps } from "../tools/siyuan/siyuan-database-extra-read.tool";
import { createSiyuanDatabaseViewTool, type SiyuanDatabaseViewDeps } from "../tools/siyuan/siyuan-database-view.tool";
import { createSiyuanNotebookManageTool, type SiyuanNotebookManageDeps } from "../tools/siyuan/siyuan-notebook-manage.tool";
import { createSiyuanDocTreeTool, type SiyuanDocTreeDeps } from "../tools/siyuan/siyuan-doc-tree.tool";
import { createSiyuanDocPathTool, type SiyuanDocPathDeps } from "../tools/siyuan/siyuan-doc-path.tool";
import { createSiyuanTagManageTool, type SiyuanTagManageDeps } from "../tools/siyuan/siyuan-tag-manage.tool";
import { createSiyuanBookmarkManageTool, type SiyuanBookmarkManageDeps } from "../tools/siyuan/siyuan-bookmark-manage.tool";
import { createSiyuanAssetReadTool, type SiyuanAssetReadDeps } from "../tools/siyuan/siyuan-asset-read.tool";
import { createSiyuanAssetManageTool, type SiyuanAssetManageDeps } from "../tools/siyuan/siyuan-asset-manage.tool";
import { createSiyuanWorkspaceFileTool, type SiyuanWorkspaceFileDeps } from "../tools/siyuan/siyuan-workspace-file.tool";
import { createSiyuanRiffDeckTool, type SiyuanRiffDeckDeps } from "../tools/siyuan/siyuan-riff-deck.tool";
import { createSiyuanRiffCardTool, type SiyuanRiffCardDeps } from "../tools/siyuan/siyuan-riff-card.tool";

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
import { executeDeleteBlocks } from "../tools/siyuan/impl/delete-blocks.impl";
import { executeMoveBlock } from "../tools/siyuan/impl/move-block.impl";
import { executeCreateDoc } from "../tools/siyuan/impl/create-doc.impl";
import { executeRenameDoc } from "../tools/siyuan/impl/rename-doc.impl";
import { executeDeleteDoc } from "../tools/siyuan/impl/delete-doc.impl";
import { executeReplaceDocContent } from "../tools/siyuan/impl/replace-doc-content.impl";
import { executeListItemsByTime } from "../tools/siyuan/impl/list-items-by-time.impl";
import { executeGetDocInfo } from "../tools/siyuan/impl/get-doc-info.impl";
import { executeListAttributeViews } from "../tools/siyuan/impl/list-attribute-views.impl";
import { executeReadAttributeView } from "../tools/siyuan/impl/read-attribute-view.impl";
import { executeFindAttributeViewRows } from "../tools/siyuan/impl/find-attribute-view-rows.impl";
import { executeUpdateAttributeViewCell } from "../tools/siyuan/impl/update-attribute-view-cell.impl";
import { executeAddAttributeViewRows } from "../tools/siyuan/impl/add-attribute-view-rows.impl";
import { executeAddAttributeViewKey } from "../tools/siyuan/impl/add-attribute-view-key.impl";
import { executeRemoveAttributeViewKey } from "../tools/siyuan/impl/remove-attribute-view-key.impl";
import { executeRemoveAttributeViewRows } from "../tools/siyuan/impl/remove-attribute-view-rows.impl";
import { executeClearAttributeViewCell } from "../tools/siyuan/impl/clear-attribute-view-cell.impl";
import { executeManageDiaryStructure } from "../tools/siyuan/impl/manage-diary-structure.impl";
import { executeManageDiaryTask } from "../tools/siyuan/impl/manage-diary-task.impl";
import { executeManageDiaryRecord } from "../tools/siyuan/impl/manage-diary-record.impl";
import { executeManageDiaryReview } from "../tools/siyuan/impl/manage-diary-review.impl";
import { executeSiyuanOutline } from "../tools/siyuan/impl/siyuan-outline.impl";
import { executeSiyuanRef } from "../tools/siyuan/impl/siyuan-ref.impl";
import { executeSiyuanSearchExtra } from "../tools/siyuan/impl/siyuan-search-extra.impl";
import { executeSiyuanSqlSelect } from "../tools/siyuan/impl/siyuan-sql-select.impl";
import { executeSiyuanBlockRead } from "../tools/siyuan/impl/siyuan-block-read.impl";
import { executeSiyuanBlockAttr } from "../tools/siyuan/impl/siyuan-block-attr.impl";
import { executeSiyuanBlockRef } from "../tools/siyuan/impl/siyuan-block-ref.impl";
import { executeSiyuanBlockState } from "../tools/siyuan/impl/siyuan-block-state.impl";
import { executeSiyuanDocTransform } from "../tools/siyuan/impl/siyuan-doc-transform.impl";
import { executeSiyuanDatabaseExtraRead } from "../tools/siyuan/impl/siyuan-database-extra-read.impl";
import { executeSiyuanDatabaseView } from "../tools/siyuan/impl/siyuan-database-view.impl";
import { executeSiyuanNotebookManage } from "../tools/siyuan/impl/siyuan-notebook-manage.impl";
import { executeSiyuanDocTree } from "../tools/siyuan/impl/siyuan-doc-tree.impl";
import { executeSiyuanDocPath } from "../tools/siyuan/impl/siyuan-doc-path.impl";
import { executeSiyuanTagManage } from "../tools/siyuan/impl/siyuan-tag-manage.impl";
import { executeSiyuanBookmarkManage } from "../tools/siyuan/impl/siyuan-bookmark-manage.impl";
import { executeSiyuanAssetRead } from "../tools/siyuan/impl/siyuan-asset-read.impl";
import { executeSiyuanAssetManage } from "../tools/siyuan/impl/siyuan-asset-manage.impl";
import { executeSiyuanWorkspaceFile } from "../tools/siyuan/impl/siyuan-workspace-file.impl";
import { executeSiyuanRiffDeck } from "../tools/siyuan/impl/siyuan-riff-deck.impl";
import { executeSiyuanRiffCard } from "../tools/siyuan/impl/siyuan-riff-card.impl";

export interface SiyuanToolRegistrationOptions {
  kbRetrievalToolDeps: SiyuanToolDeps;
  conversationId?: string;
  builtinCapabilityAccess?: {
    knowledgeBase: boolean;
    scheduleTaskDiary: boolean;
    databaseAssistant: boolean;
    docContentEditing: boolean;
    notebookDocTree: boolean;
    tagBookmarkOutline: boolean;
    assetManagement: boolean;
    riffReview: boolean;
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
  const listItemsByTimeDeps: ListItemsByTimeDeps = {
    executeListItemsByTime: (args) => executeListItemsByTime(deps, args),
  };
  const getDocInfoDeps: GetDocInfoDeps = {
    executeGetDocInfo: (args) => executeGetDocInfo(deps, args),
  };
  const listAttributeViewsDeps: ListAttributeViewsDeps = {
    executeListAttributeViews: (args) => executeListAttributeViews(deps, args),
  };
  const readAttributeViewDeps: ReadAttributeViewDeps = {
    executeReadAttributeView: (args) => executeReadAttributeView(deps, args),
  };
  const findAttributeViewRowsDeps: FindAttributeViewRowsDeps = {
    executeFindAttributeViewRows: (args) => executeFindAttributeViewRows(deps, args),
  };
  const updateAttributeViewCellDeps: UpdateAttributeViewCellDeps = {
    executeUpdateAttributeViewCell: (args) => executeUpdateAttributeViewCell(deps, args),
  };
  const addAttributeViewRowsDeps: AddAttributeViewRowsDeps = {
    executeAddAttributeViewRows: (args) => executeAddAttributeViewRows(deps, args),
  };
  const addAttributeViewKeyDeps: AddAttributeViewKeyDeps = {
    executeAddAttributeViewKey: (args) => executeAddAttributeViewKey(deps, args),
  };
  const removeAttributeViewKeyDeps: RemoveAttributeViewKeyDeps = {
    executeRemoveAttributeViewKey: (args) => executeRemoveAttributeViewKey(deps, args),
  };
  const removeAttributeViewRowsDeps: RemoveAttributeViewRowsDeps = {
    executeRemoveAttributeViewRows: (args) => executeRemoveAttributeViewRows(deps, args),
  };
  const clearAttributeViewCellDeps: ClearAttributeViewCellDeps = {
    executeClearAttributeViewCell: (args) => executeClearAttributeViewCell(deps, args),
  };
  const manageDiaryStructureDeps: ManageDiaryStructureDeps = {
    executeManageDiaryStructure: (args) => executeManageDiaryStructure(deps, args),
  };
  const manageDiaryTaskDeps: ManageDiaryTaskDeps = {
    executeManageDiaryTask: (args) => executeManageDiaryTask(deps, args),
  };
  const manageDiaryRecordDeps: ManageDiaryRecordDeps = {
    executeManageDiaryRecord: (args) => executeManageDiaryRecord(deps, args),
  };
  const manageDiaryReviewDeps: ManageDiaryReviewDeps = {
    executeManageDiaryReview: (args) => executeManageDiaryReview(deps, args),
  };
  const siyuanOutlineDeps: SiyuanOutlineDeps = { executeSiyuanOutline };
  const siyuanRefDeps: SiyuanRefDeps = { executeSiyuanRef };
  const siyuanSearchExtraDeps: SiyuanSearchExtraDeps = { executeSiyuanSearchExtra };
  const siyuanSqlSelectDeps: SiyuanSqlSelectDeps = { executeSiyuanSqlSelect };
  const siyuanBlockReadDeps: SiyuanBlockReadDeps = { executeSiyuanBlockRead };
  const siyuanBlockAttrDeps: SiyuanBlockAttrDeps = { executeSiyuanBlockAttr };
  const siyuanBlockRefDeps: SiyuanBlockRefDeps = { executeSiyuanBlockRef };
  const siyuanBlockStateDeps: SiyuanBlockStateDeps = { executeSiyuanBlockState };
  const siyuanDocTransformDeps: SiyuanDocTransformDeps = { executeSiyuanDocTransform };
  const siyuanDatabaseExtraReadDeps: SiyuanDatabaseExtraReadDeps = { executeSiyuanDatabaseExtraRead };
  const siyuanDatabaseViewDeps: SiyuanDatabaseViewDeps = { executeSiyuanDatabaseView };
  const siyuanNotebookManageDeps: SiyuanNotebookManageDeps = { executeSiyuanNotebookManage };
  const siyuanDocTreeDeps: SiyuanDocTreeDeps = { executeSiyuanDocTree };
  const siyuanDocPathDeps: SiyuanDocPathDeps = { executeSiyuanDocPath };
  const siyuanTagManageDeps: SiyuanTagManageDeps = { executeSiyuanTagManage };
  const siyuanBookmarkManageDeps: SiyuanBookmarkManageDeps = { executeSiyuanBookmarkManage };
  const siyuanAssetReadDeps: SiyuanAssetReadDeps = { executeSiyuanAssetRead };
  const siyuanAssetManageDeps: SiyuanAssetManageDeps = { executeSiyuanAssetManage };
  const siyuanWorkspaceFileDeps: SiyuanWorkspaceFileDeps = { executeSiyuanWorkspaceFile };
  const siyuanRiffDeckDeps: SiyuanRiffDeckDeps = { executeSiyuanRiffDeck };
  const siyuanRiffCardDeps: SiyuanRiffCardDeps = { executeSiyuanRiffCard };
  return {
    lkmDeps, searchDeps, readDeps, overviewDeps,
    taskDeps, recordDeps, diaryDocDeps, readDocBlocksDeps,
    listItemsByTimeDeps, getDocInfoDeps,
    listAttributeViewsDeps, readAttributeViewDeps, findAttributeViewRowsDeps,
    updateAttributeViewCellDeps, addAttributeViewRowsDeps, addAttributeViewKeyDeps, removeAttributeViewKeyDeps, removeAttributeViewRowsDeps,
    clearAttributeViewCellDeps,
    manageDiaryStructureDeps, manageDiaryTaskDeps, manageDiaryRecordDeps, manageDiaryReviewDeps,
    siyuanOutlineDeps, siyuanRefDeps, siyuanSearchExtraDeps, siyuanSqlSelectDeps,
    siyuanBlockReadDeps, siyuanBlockAttrDeps, siyuanBlockRefDeps, siyuanBlockStateDeps, siyuanDocTransformDeps,
    siyuanDatabaseExtraReadDeps, siyuanDatabaseViewDeps,
    siyuanNotebookManageDeps, siyuanDocTreeDeps, siyuanDocPathDeps,
    siyuanTagManageDeps, siyuanBookmarkManageDeps,
    siyuanAssetReadDeps, siyuanAssetManageDeps, siyuanWorkspaceFileDeps,
    siyuanRiffDeckDeps, siyuanRiffCardDeps,
  };
}

export function registerSiyuanTools(
  toolRegistry: ToolRegistry,
  options: SiyuanToolRegistrationOptions,
): void {
  const deps = options.kbRetrievalToolDeps;
  const {
    lkmDeps, searchDeps, readDeps, overviewDeps,
    taskDeps, recordDeps, diaryDocDeps, readDocBlocksDeps,
    listItemsByTimeDeps, getDocInfoDeps,
    listAttributeViewsDeps, readAttributeViewDeps, findAttributeViewRowsDeps,
    updateAttributeViewCellDeps, addAttributeViewRowsDeps, addAttributeViewKeyDeps, removeAttributeViewKeyDeps, removeAttributeViewRowsDeps,
    clearAttributeViewCellDeps,
    manageDiaryStructureDeps,
    manageDiaryTaskDeps,
    manageDiaryRecordDeps, manageDiaryReviewDeps,
    siyuanOutlineDeps, siyuanRefDeps, siyuanSearchExtraDeps, siyuanSqlSelectDeps,
    siyuanBlockReadDeps, siyuanBlockAttrDeps, siyuanBlockRefDeps, siyuanBlockStateDeps, siyuanDocTransformDeps,
    siyuanDatabaseExtraReadDeps, siyuanDatabaseViewDeps,
    siyuanNotebookManageDeps, siyuanDocTreeDeps, siyuanDocPathDeps,
    siyuanTagManageDeps, siyuanBookmarkManageDeps,
    siyuanAssetReadDeps, siyuanAssetManageDeps, siyuanWorkspaceFileDeps,
    siyuanRiffDeckDeps, siyuanRiffCardDeps,
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
    toolRegistry.ensureTool(createListItemsByTimeTool(listItemsByTimeDeps));
    toolRegistry.ensureTool(createSiyuanOutlineTool(siyuanOutlineDeps));
    toolRegistry.ensureTool(createSiyuanRefTool(siyuanRefDeps));
    toolRegistry.ensureTool(createSiyuanSearchExtraTool(siyuanSearchExtraDeps));
    toolRegistry.ensureTool(createSiyuanSqlSelectTool(siyuanSqlSelectDeps));
  }

  if (options.builtinCapabilityAccess?.scheduleTaskDiary !== false) {
    toolRegistry.ensureTool(createGetDailyWorkspaceOverviewTool(overviewDeps));
    toolRegistry.ensureTool(createQueryTasksTool(taskDeps));
    toolRegistry.ensureTool(createQueryDiaryRecordsTool(recordDeps));
    toolRegistry.ensureTool(createFindDiaryDocsTool(diaryDocDeps));
    // Write tools: task/diary management
    toolRegistry.ensureTool(createManageDiaryStructureTool(manageDiaryStructureDeps));
    toolRegistry.ensureTool(createManageDiaryTaskTool(manageDiaryTaskDeps));
    toolRegistry.ensureTool(createManageDiaryRecordTool(manageDiaryRecordDeps));
    toolRegistry.ensureTool(createManageDiaryReviewTool(manageDiaryReviewDeps));
  }

  if (options.builtinCapabilityAccess?.databaseAssistant !== false) {
    toolRegistry.ensureTool(createListAttributeViewsTool(listAttributeViewsDeps));
    toolRegistry.ensureTool(createReadAttributeViewTool(readAttributeViewDeps));
    toolRegistry.ensureTool(createFindAttributeViewRowsTool(findAttributeViewRowsDeps));
    toolRegistry.ensureTool(createUpdateAttributeViewCellTool(updateAttributeViewCellDeps));
    toolRegistry.ensureTool(createAddAttributeViewRowsTool(addAttributeViewRowsDeps));
    toolRegistry.ensureTool(createAddAttributeViewKeyTool(addAttributeViewKeyDeps));
    toolRegistry.ensureTool(createRemoveAttributeViewKeyTool(removeAttributeViewKeyDeps));
    toolRegistry.ensureTool(createRemoveAttributeViewRowsTool(removeAttributeViewRowsDeps));
    toolRegistry.ensureTool(createClearAttributeViewCellTool(clearAttributeViewCellDeps));
    toolRegistry.ensureTool(createSiyuanDatabaseExtraReadTool(siyuanDatabaseExtraReadDeps));
    toolRegistry.ensureTool(createSiyuanDatabaseViewTool(siyuanDatabaseViewDeps));
  }

  if (options.builtinCapabilityAccess?.docContentEditing === true) {
    toolRegistry.ensureTool(createReadDocBlocksTool(readDocBlocksDeps));
    toolRegistry.ensureTool(createSiyuanBlockReadTool(siyuanBlockReadDeps));
    toolRegistry.ensureTool(createSiyuanBlockAttrTool(siyuanBlockAttrDeps));
    toolRegistry.ensureTool(createSiyuanBlockRefTool(siyuanBlockRefDeps));
    toolRegistry.ensureTool(createSiyuanBlockStateTool(siyuanBlockStateDeps));
    toolRegistry.ensureTool(createSiyuanDocTransformTool(siyuanDocTransformDeps));
    if (options.conversationId) {
      const writeDeps = { ...deps, conversationId: options.conversationId };
      toolRegistry.ensureTool(createUpdateBlockTool({ executeUpdateBlock: (args, abortSignal) => executeUpdateBlock({ ...writeDeps, abortSignal }, args) }));
      toolRegistry.ensureTool(createInsertBlockTool({ executeInsertBlock: (args, abortSignal) => executeInsertBlock({ ...writeDeps, abortSignal }, args) }));
      toolRegistry.ensureTool(createDeleteBlocksTool({ executeDeleteBlocks: (args, abortSignal) => executeDeleteBlocks({ ...writeDeps, abortSignal }, args) }));
      toolRegistry.ensureTool(createMoveBlockTool({ executeMoveBlock: (args, abortSignal) => executeMoveBlock({ ...writeDeps, abortSignal }, args) }));
      toolRegistry.ensureTool(createCreateDocTool({ executeCreateDoc: (args, abortSignal) => executeCreateDoc({ ...writeDeps, abortSignal }, args) }));
      toolRegistry.ensureTool(createRenameDocTool({ executeRenameDoc: (args, abortSignal) => executeRenameDoc({ ...writeDeps, abortSignal }, args) }));
      toolRegistry.ensureTool(createDeleteDocTool({ executeDeleteDoc: (args, abortSignal) => executeDeleteDoc({ ...writeDeps, abortSignal }, args) }));
      toolRegistry.ensureTool(createReplaceDocContentTool({ executeReplaceDocContent: (args, abortSignal) => executeReplaceDocContent({ ...writeDeps, abortSignal }, args) }));
    }
  }

  if (options.builtinCapabilityAccess?.notebookDocTree === true) {
    toolRegistry.ensureTool(createSiyuanNotebookManageTool(siyuanNotebookManageDeps));
    toolRegistry.ensureTool(createSiyuanDocTreeTool(siyuanDocTreeDeps));
    toolRegistry.ensureTool(createSiyuanDocPathTool(siyuanDocPathDeps));
  }

  if (options.builtinCapabilityAccess?.tagBookmarkOutline === true) {
    toolRegistry.ensureTool(createSiyuanTagManageTool(siyuanTagManageDeps));
    toolRegistry.ensureTool(createSiyuanBookmarkManageTool(siyuanBookmarkManageDeps));
    toolRegistry.ensureTool(createSiyuanOutlineTool(siyuanOutlineDeps));
    toolRegistry.ensureTool(createSiyuanBlockAttrTool(siyuanBlockAttrDeps));
    toolRegistry.ensureTool(createSiyuanDocPathTool(siyuanDocPathDeps));
  }

  if (options.builtinCapabilityAccess?.assetManagement === true) {
    toolRegistry.ensureTool(createSiyuanAssetReadTool(siyuanAssetReadDeps));
    toolRegistry.ensureTool(createSiyuanAssetManageTool(siyuanAssetManageDeps));
    toolRegistry.ensureTool(createSiyuanWorkspaceFileTool(siyuanWorkspaceFileDeps));
  }

  if (options.builtinCapabilityAccess?.riffReview === true) {
    toolRegistry.ensureTool(createSiyuanRiffDeckTool(siyuanRiffDeckDeps));
    toolRegistry.ensureTool(createSiyuanRiffCardTool(siyuanRiffCardDeps));
  }
}
