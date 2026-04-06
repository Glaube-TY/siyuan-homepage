<script lang="ts">
    import type { WidgetsSettingsState, WidgetsSettingsActions, DocPreviewMode } from '../types';

    interface Props {
        state: WidgetsSettingsState;
        actions: WidgetsSettingsActions;
    }

    let { state, actions }: Props = $props();
</script>

<div class="section-setting widgets-setting">
    <div class="form-group widget-layout-setting">
        <h3>组件布局设置</h3>
        <label for=""
            >每行组件数量：<input
                type="number"
                value={state.widgetLayoutNumber}
                oninput={(e) => actions.onWidgetLayoutNumberChange(Number((e.currentTarget as HTMLInputElement).value))}
            /></label
        >
        <label for="widget-gap"
            >组件间距：<input
                type="number"
                value={state.widgetGap}
                oninput={(e) => actions.onWidgetGapChange(Number((e.currentTarget as HTMLInputElement).value))}
            /></label
        >
    </div>
    <div class="form-group quick-notes-setting">
        <h3>快速笔记设置</h3>
        <label for="quick-notes-open"
            ><input
                id="quick-notes-open"
                type="checkbox"
                checked={state.quickNotesEnabled}
                onchange={(e) => actions.onQuickNotesEnabledChange((e.currentTarget as HTMLInputElement).checked)}
            />开启快速笔记</label
        >

        {#if state.quickNotesEnabled}
            <label for=""
                >快速笔记位置：
                <input
                    type="text"
                    placeholder="输入用于存放快速笔记的文档 ID"
                    value={state.quickNotesPosition}
                    oninput={(e) => actions.onQuickNotesPositionChange((e.currentTarget as HTMLInputElement).value)}
                />
            </label>
            <label for="quick-notes-position"
                >添加位置：<select
                    name="quick-notes-position"
                    id="quick-notes-position"
                    value={state.quickNotesAddPosition}
                    onchange={(e) => actions.onQuickNotesAddPositionChange((e.currentTarget as HTMLSelectElement).value)}
                >
                    <option value="bottom">文档最后</option>
                    <option value="top">文档最前</option>
                </select></label
            >
            <label for="quick-notes-timestamp"
                ><input
                    id="quick-notes-timestamp"
                    type="checkbox"
                    checked={state.quickNotesTimestampEnabled}
                    onchange={(e) => actions.onQuickNotesTimestampEnabledChange((e.currentTarget as HTMLInputElement).checked)}
                />
                启用时间戳
            </label>
        {/if}
    </div>
    <div class="form-group task-plus-setting">
        <h3>任务管理Plus设置</h3>
        <label for="task-editor-enabled"
            ><input
                id="task-editor-enabled"
                type="checkbox"
                checked={state.taskEditorEnabled}
                onchange={(e) => actions.onTaskEditorEnabledChange((e.currentTarget as HTMLInputElement).checked)}
            /> 开启任务编辑器</label
        >
    </div>
    <div class="form-group doc-preview-setting">
        <h3>文档预览设置</h3>
        <label for="doc-preview-mode"
            >默认预览模式：
            <select
                id="doc-preview-mode"
                value={state.defaultDocPreviewMode}
                onchange={(e) => actions.onDefaultDocPreviewModeChange((e.currentTarget as HTMLSelectElement).value as DocPreviewMode)}
            >
                <option value="preview">预览模式</option>
                <option value="wysiwyg">所见即所得</option>
            </select>
        </label>
        <p class="setting-hint" style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-top: 4px;">
            用于控制支持文档悬浮预览的组件在默认情况下以哪种模式打开文档。
        </p>
    </div>
</div>