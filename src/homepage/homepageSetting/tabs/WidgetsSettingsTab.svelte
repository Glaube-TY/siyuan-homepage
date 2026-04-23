<script lang="ts">
    import type { WidgetsSettingsState, WidgetsSettingsActions, DocPreviewMode } from '../types';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

    interface Props {
        state: WidgetsSettingsState;
        actions: WidgetsSettingsActions;
    }

    let { state, actions }: Props = $props();
</script>

<SettingSection title="组件布局">
    <SettingRow title="每行组件数量" description="设置主页每行显示的组件个数">
        <input
            type="number"
            class="control-sm"
            value={state.widgetLayoutNumber}
            oninput={(e) => actions.onWidgetLayoutNumberChange(Number((e.currentTarget as HTMLInputElement).value))}
        />
    </SettingRow>
    <SettingRow title="组件间距" description="设置组件之间的间距（单位：rem）">
        <input
            type="number"
            class="control-sm"
            step="0.1"
            value={state.widgetGap}
            oninput={(e) => actions.onWidgetGapChange(Number((e.currentTarget as HTMLInputElement).value))}
        />
    </SettingRow>
</SettingSection>

<SettingSection title="快速笔记">
    <SettingRow title="开启快速笔记">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.quickNotesEnabled}
            onchange={(e) => actions.onQuickNotesEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if state.quickNotesEnabled}
        <SettingRow title="笔记存放位置" description="输入用于存放快速笔记的文档 ID">
            <input
                type="text"
                class="control-full"
                placeholder="输入文档 ID"
                value={state.quickNotesPosition}
                oninput={(e) => actions.onQuickNotesPositionChange((e.currentTarget as HTMLInputElement).value)}
            />
        </SettingRow>
        <SettingRow title="添加位置" description="新笔记添加到文档的顶部还是底部">
            <select
                class="control-md"
                value={state.quickNotesAddPosition}
                onchange={(e) => actions.onQuickNotesAddPositionChange((e.currentTarget as HTMLSelectElement).value)}
            >
                <option value="bottom">文档最后</option>
                <option value="top">文档最前</option>
            </select>
        </SettingRow>
        <SettingRow title="启用时间戳" description="在笔记内容前添加创建时间">
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                checked={state.quickNotesTimestampEnabled}
                onchange={(e) => actions.onQuickNotesTimestampEnabledChange((e.currentTarget as HTMLInputElement).checked)}
            />
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="任务管理 Plus">
    <SettingRow title="开启任务编辑器" description="启用任务管理 Plus 功能">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.taskEditorEnabled}
            onchange={(e) => actions.onTaskEditorEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
</SettingSection>

<SettingSection title="文档预览">
    <SettingRow title="默认预览模式" description="控制支持文档悬浮预览的组件默认打开模式">
        <select
            class="control-md"
            value={state.defaultDocPreviewMode}
            onchange={(e) => actions.onDefaultDocPreviewModeChange((e.currentTarget as HTMLSelectElement).value as DocPreviewMode)}
        >
            <option value="preview">预览模式</option>
            <option value="wysiwyg">所见即所得</option>
        </select>
    </SettingRow>
</SettingSection>