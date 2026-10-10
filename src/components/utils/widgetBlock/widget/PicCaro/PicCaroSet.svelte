<script lang="ts">
    import { onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import { pickWorkspaceImage } from "@/homepage/utils/workspaceImage";
    import { appendPicAsset, MAX_PIC_ASSETS, type PicSourceMode as PicCaroSourceMode } from "./picCaroData";
    import DirectoryPathSetting from "../../shared/DirectoryPathSetting.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    interface Props {
        advancedEnabled: boolean;
        PicSourceMode?: PicCaroSourceMode;
        PicAssetPaths?: string[];
        sourceError?: string;
        PicFolderPath?: string; // 图片文件夹路径
        PicAutoPlay?: boolean; // 是否自动播放
        PicInterval?: number; // 切换间隔（秒）
        PicNavigation?: boolean; // 是否显示导航按钮
        PicPagination?: boolean; // 是否显示分页按钮
        PicPaginationType?: string; // 分页按钮类型
        PicPaginationDyBu?: boolean; // 动态分页圆点
        PicPaginationPrOp?: boolean; // 分页进度条是否反方向
        PicEffect?: string; // 切换效果
        PicSlidesPerView?: string; // 每页显示的图片数量
        PicRandomSwitch?: boolean; // 是否随机切换
    }

    let {
        advancedEnabled,
        PicSourceMode = $bindable("localFolder"),
        PicAssetPaths = $bindable([]),
        sourceError = "",
        PicFolderPath = $bindable(""),
        PicAutoPlay = $bindable(false),
        PicInterval = $bindable(3),
        PicNavigation = $bindable(false),
        PicPagination = $bindable(false),
        PicPaginationType = $bindable("bullets"),
        PicPaginationDyBu = $bindable(false),
        PicPaginationPrOp = $bindable(false),
        PicEffect = $bindable("slide"),
        PicSlidesPerView = $bindable("1"),
        PicRandomSwitch = $bindable(false)
    }: Props = $props();

    let picking = $state(false);
    let alive = true;
    let selectionRevision = 0;
    onDestroy(() => { alive = false; });
    function cancelPendingSelection(): void { selectionRevision++; }
    $effect(() => { if (!advancedEnabled) cancelPendingSelection(); });

    async function addImage(): Promise<void> {
        if (!alive || picking || sourceError || !advancedEnabled || PicSourceMode !== "workspaceAssets") return;
        if (PicAssetPaths.length >= MAX_PIC_ASSETS) { showMessage("最多添加 100 张资源图片", 3000); return; }
        picking = true;
        const revision = selectionRevision;
        try {
            const url = await pickWorkspaceImage();
            if (!alive || revision !== selectionRevision || sourceError || !advancedEnabled || PicSourceMode !== "workspaceAssets" || url === null) return;
            const next = appendPicAsset(PicAssetPaths, url);
            if (next === PicAssetPaths) showMessage("该图片已在列表中", 3000);
            else PicAssetPaths = next;
        } catch {
            if (alive && revision === selectionRevision && advancedEnabled && PicSourceMode === "workspaceAssets") {
                showMessage("添加图片失败，请检查资源路径、管理员及非只读权限；已有列表已保留。", 5000, "error");
            }
        } finally { if (alive) picking = false; }
    }

    function removeImage(index: number): void {
        if (!alive || sourceError || !advancedEnabled) return;
        PicAssetPaths = PicAssetPaths.filter((_, current) => current !== index);
    }

    function moveImage(index: number, offset: number): void {
        if (!alive || sourceError || !advancedEnabled) return;
        const next = [...PicAssetPaths], target = index + offset;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        PicAssetPaths = next;
    }
</script>

<div class="pic-caro-settings">
    {#if advancedEnabled}
        <SettingSection title="图片来源">
            <SettingRow title="图片来源" description="本地文件夹依赖桌面 Electron；思源资源图片可跨平台使用">
                <select class="control-md" bind:value={PicSourceMode} onchange={cancelPendingSelection} disabled={Boolean(sourceError)}>
                    <option value="localFolder">本地图片文件夹</option>
                    <option value="workspaceAssets">思源资源图片</option>
                </select>
            </SettingRow>
            {#if sourceError}
                <p class="ft__error" role="alert">{sourceError}。请检查此组件配置，当前保存已阻止。</p>
            {/if}
        </SettingSection>
        {#if !sourceError && PicSourceMode === "localFolder"}
        <DirectoryPathSetting
            sectionTitle="图片路径"
            rowTitle="文件夹路径"
            bind:path={PicFolderPath}
            placeholder="请选择图片文件夹"
            buttonTitle="选择图片文件夹"
        />
        {:else if !sourceError}
            <SettingSection title="思源资源图片">
                <SettingRow title={`图片列表（${PicAssetPaths.length} / ${MAX_PIC_ASSETS}）`} description="逐张选择已有资源；删除和排序只修改当前组件的待保存列表">
                    <button type="button" class="b3-button b3-button--outline" disabled={picking}
                        aria-busy={picking} onclick={addImage}>{picking ? "正在选择…" : "添加图片"}</button>
                </SettingRow>
                {#if PicAssetPaths.length >= MAX_PIC_ASSETS}<p role="status">已达到 100 张上限，请先移除列表项再添加。</p>{/if}
                {#each PicAssetPaths as path, index (path)}
                    <div class="asset-row">
                        <span class="asset-path" title={path}>{index + 1}. {path}</span>
                        <div class="asset-actions">
                            <button type="button" class="b3-button b3-button--outline" disabled={index === 0}
                                aria-label={`上移第 ${index + 1} 张图片`} onclick={() => moveImage(index, -1)}>上移</button>
                            <button type="button" class="b3-button b3-button--outline" disabled={index === PicAssetPaths.length - 1}
                                aria-label={`下移第 ${index + 1} 张图片`} onclick={() => moveImage(index, 1)}>下移</button>
                            <button type="button" class="b3-button b3-button--outline"
                                aria-label={`移除第 ${index + 1} 张图片`} onclick={() => removeImage(index)}>移除</button>
                        </div>
                    </div>
                {:else}<p class="ft__secondary">尚未添加图片，选择当前思源工作空间中的图片开始轮播。</p>{/each}
            </SettingSection>
        {/if}

        <SettingSection title="播放设置">
            <SettingRow title="自动播放">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={PicAutoPlay} />
            </SettingRow>
            {#if PicAutoPlay}
                <SettingRow title="切换间隔">
                    <input type="number" bind:value={PicInterval} class="control-sm" />
                    <span>秒</span>
                </SettingRow>
            {/if}
            <SettingRow title="显示切换按钮">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={PicNavigation} />
            </SettingRow>
            <SettingRow title="随机播放">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={PicRandomSwitch} />
            </SettingRow>
        </SettingSection>

        <SettingSection title="分页设置">
            <SettingRow title="显示分页进度">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={PicPagination} />
            </SettingRow>
            {#if PicPagination}
                <SettingRow title="分页样式">
                    <select bind:value={PicPaginationType} class="control-sm">
                        <option value="bullets">圆点</option>
                        <option value="fraction">分式</option>
                        <option value="progressbar">进度条</option>
                    </select>
                </SettingRow>
                {#if PicPaginationType === "bullets"}
                    <SettingRow title="动态圆点">
                        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={PicPaginationDyBu} />
                    </SettingRow>
                {:else if PicPaginationType === "progressbar"}
                    <SettingRow title="进度条反方向">
                        <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={PicPaginationPrOp} />
                    </SettingRow>
                {/if}
            {/if}
        </SettingSection>

        <SettingSection title="切换效果">
            <SettingRow title="效果类型">
                <select bind:value={PicEffect} class="control-sm">
                    <option value="slide">滑动</option>
                    <option value="fade">淡入</option>
                    <option value="cube">立方体</option>
                    <option value="coverflow">封面流</option>
                    <option value="flip">翻转</option>
                </select>
            </SettingRow>
            {#if PicEffect === "slide"}
                <SettingRow title="每页显示数量">
                    <input type="number" bind:value={PicSlidesPerView} class="control-sm" />
                </SettingRow>
            {/if}
        </SettingSection>
    {:else}
        <AdvancedFeatureLock
            title="图片轮播"
            subtitle="精美图片自动轮播，让主页更有视觉冲击力。"
            icon="image"
            features={[
                "自动轮播展示图片",
                "支持多种切换动画效果",
                "适合摄影作品和壁纸展示"
            ]}
            highlights={["自动轮播", "动画效果", "视觉展示"]}
        />
    {/if}
</div>

<style>
    .asset-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-block: 8px; }
    .asset-path { flex: 1 1 160px; min-width: 0; overflow-wrap: anywhere; color: var(--b3-theme-on-surface); }
    .asset-actions { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
