<script lang="ts">
    import { showMessage } from "siyuan";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled: boolean;
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

    // 选择图片文件夹
    async function selectPicFolder() {
        try {
            if (
                !window.navigator.userAgent.includes("Electron") ||
                typeof window.require !== "function"
            )
                return showMessage("此功能仅在桌面版可用");
            const { filePaths } = await window
                .require("@electron/remote")
                .dialog.showOpenDialog({
                    properties: ["openDirectory", "createDirectory"],
                });

            if (filePaths && filePaths.length > 0) {
                PicFolderPath = filePaths[0];
            }
        } catch (error) {
            console.error("选择文件夹时发生错误：", error);
        }
    }
</script>

<div class="pic-caro-settings">
    {#if advancedEnabled}
        <SettingSection title="图片路径">
            <SettingRow title="文件夹路径">
                <div class="file-path-group">
                    <input
                        type="text"
                        bind:value={PicFolderPath}
                        placeholder="请选择图片文件夹"
                        class="control-full"
                        readonly
                    />
                    <button title="选择图片文件夹" onclick={selectPicFolder} class="file-action-btn">📁</button>
                </div>
            </SettingRow>
        </SettingSection>

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
        <h3>👑会员专属权益👑</h3>
    {/if}
</div>
