<script lang="ts">
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";

    export let plugin: any;
    export let contentTypeJson: string = "{}";
    const parsedContent = JSON.parse(contentTypeJson);
    const selectedConstellation =
        parsedContent.data?.selectedConstellation || "摩羯";

    let constellationData: any = null;
    let advancedEnabled = false;

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
        constellationData = await getConstellationInfo();
    });

    const getConstellationInfo = async () => {
        const response = await fetch(
            `https://v.api.aa1.cn/api/xingzuo/?msg=${selectedConstellation}`,
        );
        const data = await response.json();

        if (data.code != 1) {
            showMessage(`获取 ${selectedConstellation} 运势错误：${data.msg}`);
            return;
        }

        return data;
    };

    // 字段对应的中文名称
    const fieldNames = {
        ts: "提示",
        ztys: "整体运势",
        syys: "事业运势",
        cfys: "财富运势",
        aqys: "爱情运势",
        xyys: "幸运颜色",
        xysz: "幸运数字",
        grxz: "贵人星座",
        grfw: "贵人方位",
        xz: "星座",
        msg: "查询结果",
        code: "状态码",
    };

    // 星座符号映射
    const constellationSymbols = {
        白羊: "♈",
        金牛: "♉",
        双子: "♊",
        巨蟹: "♋",
        狮子: "♌",
        处女: "♍",
        天秤: "♎",
        天蝎: "♏",
        射手: "♐",
        摩羯: "♑",
        水瓶: "♒",
        双鱼: "♓",
    };
</script>

<div class="content-display">
    {#if advancedEnabled}
        <h3 class="widget-title">
            {constellationSymbols[selectedConstellation] || ""}
            {selectedConstellation}运势
        </h3>

        {#if constellationData}
            <div class="fortune-card">
                <div class="fortune-card1">
                    <div class="fortune-item">
                        <span><strong>{fieldNames.xyys}</strong>：{constellationData.xyys}</span>
                    </div>

                    <div class="fortune-item">
                        <span><strong>{fieldNames.xysz}</strong>：{constellationData.xysz}</span>
                    </div>

                    <div class="fortune-item">
                        <span><strong>{fieldNames.grxz}</strong>：{constellationData.grxz}</span>
                    </div>

                    <div class="fortune-item">
                        <span><strong>{fieldNames.grfw}</strong>：{constellationData.grfw}</span>
                    </div>

                    <div class="fortune-item">
                        <span><strong>{fieldNames.ts}</strong>：{constellationData.ts}</span>
                    </div>
                </div>
                <div class="fortune-card2">
                    <div class="fortune-item">
                        <h4>{fieldNames.ztys}</h4>
                        <p>{constellationData.ztys}</p>
                    </div>

                    <div class="fortune-item">
                        <h4>{fieldNames.syys}</h4>
                        <p>{constellationData.syys}</p>
                    </div>

                    <div class="fortune-item">
                        <h4>{fieldNames.cfys}</h4>
                        <p>{constellationData.cfys}</p>
                    </div>

                    <div class="fortune-item">
                        <h4>{fieldNames.aqys}</h4>
                        <p>{constellationData.aqys}</p>
                    </div>
                </div>
            </div>
        {:else}
            <p>正在加载运势信息...</p>
        {/if}
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

        .widget-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 0.5rem;
            padding-bottom: 0.3rem;
            border-bottom: 1px solid var(--b3-border-color);
            text-align: center;
            display: inline-block;
            line-height: 1.2;
        }

        .fortune-card {
            display: flex;
            overflow-y: auto;
            flex-direction: column;
            gap: 1rem;

            .fortune-card1 {
                padding-left: 0;
                margin: 0;
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                grid-gap: 1rem;
                align-items: start;
            }

            .fortune-card2 {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }

            .fortune-item {
                padding: 0.5rem 0.75rem;
                background-color: var(--b3-theme-surface);
                border-radius: 6px;
                font-size: 14px;
                transition: background-color 0.2s ease;
                break-inside: avoid;
                display: flex;
                flex-direction: column;

                h4 {
                    font-weight: 600;
                    margin-bottom: 0.3rem;
                }

                p {
                    margin: 0;
                    line-height: 1.4;
                }
            }
        }

        .content-not-advanced {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }
    }
</style>