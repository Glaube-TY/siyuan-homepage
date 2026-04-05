<script lang="ts">
    import { showMessage } from "siyuan";

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
        <div class="content-panel picCaro">
            <label class="folder-select-label">
                <span>图片路径：</span>
                <input
                    type="text"
                    bind:value={PicFolderPath}
                    placeholder="请选择图片文件夹"
                />
                <button title="选择图片文件夹" onclick={selectPicFolder}
                    >📁</button
                >
            </label>
        </div>
        <div class="content-panel picCaro">
            <div
                style="display: flex; gap: 1rem; align-items: center; padding-top: 1rem;"
            >
                <label for="autoPlay"
                    ><input
                        type="checkbox"
                        id="autoPlay"
                        bind:checked={PicAutoPlay}
                    />自动播放</label
                >
                {#if PicAutoPlay}
                    <label for="interval"
                        >间隔：<input
                            type="number"
                            id="interval"
                            style="width: 50px;"
                            bind:value={PicInterval}
                        />秒</label
                    >
                {/if}
                <label for="navigation"
                    ><input
                        type="checkbox"
                        id="navigation"
                        bind:checked={PicNavigation}
                    />显示切换按钮</label
                >
                <label for="randomSwitch"
                    ><input
                        type="checkbox"
                        id="randomSwitch"
                        bind:checked={PicRandomSwitch}
                    />随机</label
                >
            </div>
        </div>
        <div class="content-panel picCaro">
            <div
                style="display: flex; gap: 1rem; align-items: center; padding-top: 1rem;"
            >
                <label for="pagination"
                    ><input
                        type="checkbox"
                        id="pagination"
                        bind:checked={PicPagination}
                    />显示分页进度</label
                >
                {#if PicPagination}
                    <label for="paginationType"
                        >样式：<select
                            id="paginationType"
                            bind:value={PicPaginationType}
                        >
                            <option value="bullets">圆点</option>
                            <option value="fraction">分式</option>
                            <option value="progressbar">进度条</option>
                        </select></label
                    >
                    {#if PicPaginationType === "bullets"}
                        <label for="dynamicBullets"
                            ><input
                                type="checkbox"
                                id="dynamicBullets"
                                bind:checked={PicPaginationDyBu}
                            />动态圆点</label
                        >
                    {:else if PicPaginationType === "progressbar"}
                        <label for="paginationProgressOpposite"
                            ><input
                                type="checkbox"
                                id="paginationProgressOpposite"
                                bind:checked={PicPaginationPrOp}
                            />进度条反方向</label
                        >
                    {/if}
                {/if}
            </div>
        </div>
        <div class="content-panel picCaro">
            <div
                style="display: flex; gap: 1rem; align-items: center; padding-top: 1rem;"
            >
                <label for="effect"
                    >切换效果：<select id="effect" bind:value={PicEffect}>
                        <option value="slide">滑动</option>
                        <option value="fade">淡入</option>
                        <option value="cube">立方体</option>
                        <option value="coverflow">封面流</option>
                        <option value="flip">翻转</option>
                    </select></label
                >
                {#if PicEffect === "slide"}
                    <label for="slidesPerView"
                        >每页显示的图片数量：<input
                            type="number"
                            id="slidesPerView"
                            style="width: 50px;"
                            bind:value={PicSlidesPerView}
                        /></label
                    >
                {/if}
            </div>
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <hr />
    <div>
        组件说明：<a
            href="https://ai.feishu.cn/wiki/MLaew9FOwiEREHkao1HcZof2nEd"
            target="_blank">图片轮播</a
        >
    </div>
</div>

<style lang="scss">
    .picCaro {
        display: flex;
        flex-direction: column;
        gap: 1rem;

        .folder-select-label {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;

            span {
                white-space: nowrap; // 禁止文字换行
                flex-shrink: 0; // 禁止压缩
            }

            input[type="text"] {
                flex: 1 1 auto; // 允许压缩和扩展
                min-width: 120px; // 设置最小宽度防止过度压缩
            }

            button {
                white-space: nowrap;
                padding: 6px 12px;
                flex-shrink: 0; // 禁止按钮压缩
            }
        }
    }
</style>
