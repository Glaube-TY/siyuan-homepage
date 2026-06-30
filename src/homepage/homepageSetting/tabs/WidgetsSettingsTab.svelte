<script lang="ts">
    import type { WidgetsSettingsState, WidgetsSettingsActions, DocPreviewMode, ComponentSectionsNavAlign } from '../types';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

    interface Props {
        state: WidgetsSettingsState;
        actions: WidgetsSettingsActions;
    }

    let { state, actions }: Props = $props();

    const navAlignOptions: { value: ComponentSectionsNavAlign; label: string }[] = [
        { value: "left", label: "左对齐" },
        { value: "center", label: "居中" },
        { value: "right", label: "右对齐" },
    ];
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

<SettingSection title="组件分区导航 👑">
    <SettingRow
        title="启用分区导航"
        description={state.advancedEnabled
            ? "开启后，桌面主页组件区顶部显示自定义分区导航。"
            : "会员专属，过期后按普通组件布局显示，分区数据保留。"}
    >
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.componentSectionsEnabled}
            disabled={!state.advancedEnabled}
            onchange={(e) => actions.onComponentSectionsEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if state.componentSectionsEnabled}
        <SettingRow title="导航对齐" description="设置桌面主页组件分区导航按钮的水平位置">
            <div class="component-section-align-control">
                {#each navAlignOptions as option}
                    <button
                        type="button"
                        class="component-section-align-button"
                        class:active={state.componentSectionsNavAlign === option.value}
                        onclick={() => actions.onComponentSectionsNavAlignChange(option.value)}
                    >
                        {option.label}
                    </button>
                {/each}
            </div>
        </SettingRow>

        <div class="component-sections-manager">
            {#each state.componentSections as section, index (section.id)}
                <div class="component-section-item">
                    <input
                        type="text"
                        class="control-full component-section-name"
                        value={section.name}
                        oninput={(e) => actions.onRenameComponentSection(section.id, (e.currentTarget as HTMLInputElement).value)}
                    />
                    <div class="component-section-actions">
                        <button
                            type="button"
                            class="component-section-action"
                            disabled={index === 0}
                            onclick={() => actions.onMoveComponentSectionUp(section.id)}
                        >
                            上移
                        </button>
                        <button
                            type="button"
                            class="component-section-action"
                            disabled={index === state.componentSections.length - 1}
                            onclick={() => actions.onMoveComponentSectionDown(section.id)}
                        >
                            下移
                        </button>
                        <button
                            type="button"
                            class="component-section-action danger"
                            disabled={state.componentSections.length <= 1 || section.id === "overview"}
                            onclick={() => actions.onDeleteComponentSection(section.id)}
                        >
                            删除
                        </button>
                    </div>
                </div>
            {/each}
            <button
                type="button"
                class="component-section-add"
                onclick={actions.onAddComponentSection}
            >
                新增分区
            </button>
        </div>
    {/if}
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

<style lang="scss">
    .component-sections-manager {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        min-width: 0;
    }

    .component-section-item {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) auto;
        gap: 8px;
        align-items: center;
        min-width: 0;
    }

    .component-section-name {
        min-width: 0;
    }

    .component-section-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: flex-end;
    }

    .component-section-align-control {
        display: inline-flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .component-section-align-button,
    .component-section-action,
    .component-section-add {
        border: 1px solid var(--b3-border-color, rgba(127, 127, 127, 0.24));
        background: var(--b3-theme-background, #fff);
        color: var(--b3-theme-on-background, #1f2937);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
    }

    .component-section-align-button.active {
        border-color: var(--b3-theme-primary, #3575f0);
        background: var(--b3-theme-primary, #3575f0);
        color: var(--b3-theme-on-primary, #fff);
    }

    .component-section-action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .component-section-action.danger {
        color: var(--b3-theme-error, #dc2626);
    }

    .component-section-add {
        align-self: flex-start;
        color: var(--b3-theme-primary, #3575f0);
    }

    @media (max-width: 620px) {
        .component-section-item {
            grid-template-columns: 1fr;
        }

        .component-section-actions {
            justify-content: flex-start;
        }
    }
</style>

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
