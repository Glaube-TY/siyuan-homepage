<script lang="ts">
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();
    const parsedContent = JSON.parse(contentTypeJson);
    const selectedConstellation =
        parsedContent.data?.selectedConstellation || "摩羯";

    let constellationData: any = $state(null);
    let advancedEnabled = $state(false);

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
        constellationData = await getConstellationInfo();
    });

    const getConstellationInfo = async () => {
        const response = await fetch(
            `https://v2.xxapi.cn/api/horoscope?type=${selectedConstellation}&time=today`,
        );
        const data = await response.json();

        if (data.code != 200) {
            showMessage(`获取 ${getDisplayName(selectedConstellation)} 运势错误：${data.msg}`);
            return;
        }

        return data.data; // 返回data.data，新的API结构
    };

    // 字段对应的中文名称（根据新API结构更新）
    const fieldNames = {
        all: "整体运势",
        work: "事业运势",
        money: "财富运势",
        love: "爱情运势",
        health: "健康运势",
        luckycolor: "幸运颜色",
        luckynumber: "幸运数字",
        luckyconstellation: "贵人星座",
        shortcomment: "简短评语",
        todo: "今日建议",
        name: "星座名称",
        title: "星座标题",
        time: "时间",
        type: "运势类型",
        index: "运势指数",
        fortunetext: "运势详情",
    };

    // 英文到中文的星座名称映射
    const constellationNameMap = {
        aries: "白羊",
        taurus: "金牛",
        gemini: "双子",
        cancer: "巨蟹",
        leo: "狮子",
        virgo: "处女",
        libra: "天秤",
        scorpio: "天蝎",
        sagittarius: "射手",
        capricorn: "摩羯",
        aquarius: "水瓶",
        pisces: "双鱼",
    };

    // 获取显示用的中文名称
    const getDisplayName = (englishName: string): string => {
        return constellationNameMap[englishName] || englishName;
    };
</script>

<div class="content-display">
    {#if advancedEnabled}
        <h3 class="widget-title">
            {constellationData?.title ? constellationData.title : getDisplayName(selectedConstellation)}
        </h3>

        {#if constellationData}
            <div class="fortune-card">
                <!-- 运势指数卡片 -->
                <div class="fortune-card1">
                    <div class="fortune-item">
                        <span><strong>整体指数</strong>：{constellationData.index?.all || 'N/A'}</span>
                    </div>
                    <div class="fortune-item">
                        <span><strong>健康指数</strong>：{constellationData.index?.health || 'N/A'}</span>
                    </div>
                    <div class="fortune-item">
                        <span><strong>爱情指数</strong>：{constellationData.index?.love || 'N/A'}</span>
                    </div>
                    <div class="fortune-item">
                        <span><strong>财运指数</strong>：{constellationData.index?.money || 'N/A'}</span>
                    </div>
                    <div class="fortune-item">
                        <span><strong>事业指数</strong>：{constellationData.index?.work || 'N/A'}</span>
                    </div>
                </div>

                <!-- 幸运信息卡片 -->
                <div class="fortune-card1">
                    <div class="fortune-item">
                        <span><strong>{fieldNames.luckycolor}</strong>：{constellationData.luckycolor}</span>
                    </div>
                    <div class="fortune-item">
                        <span><strong>{fieldNames.luckynumber}</strong>：{constellationData.luckynumber}</span>
                    </div>
                    <div class="fortune-item">
                        <span><strong>{fieldNames.luckyconstellation}</strong>：{constellationData.luckyconstellation}</span>
                    </div>
                    <div class="fortune-item">
                        <span><strong>今日建议</strong>：宜 {constellationData.todo?.yi || 'N/A'}，忌 {constellationData.todo?.ji || 'N/A'}</span>
                    </div>
                    <div class="fortune-item">
                        <span><strong>简短评语</strong>：{constellationData.shortcomment}</span>
                    </div>
                </div>

                <!-- 详细运势卡片 -->
                <div class="fortune-card2">
                    <div class="fortune-item">
                        <h4>{fieldNames.all}</h4>
                        <p>{constellationData.fortunetext?.all}</p>
                    </div>
                    <div class="fortune-item">
                        <h4>{fieldNames.health}</h4>
                        <p>{constellationData.fortunetext?.health}</p>
                    </div>
                    <div class="fortune-item">
                        <h4>{fieldNames.love}</h4>
                        <p>{constellationData.fortunetext?.love}</p>
                    </div>
                    <div class="fortune-item">
                        <h4>{fieldNames.money}</h4>
                        <p>{constellationData.fortunetext?.money}</p>
                    </div>
                    <div class="fortune-item">
                        <h4>{fieldNames.work}</h4>
                        <p>{constellationData.fortunetext?.work}</p>
                    </div>
                </div>
            </div>
        {:else}
            <div style="text-align: center; padding: 2rem; color: var(--b3-theme-on-surface-light);">
                <p>🌟 正在加载运势信息...</p>
                <small style="font-size: 12px; margin-top: 8px; display: block;">
                    星座: {getDisplayName(selectedConstellation)}
                </small>
            </div>
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
            gap: 1.5rem;

            .fortune-card1 {
                padding-left: 0;
                margin: 0;
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                grid-gap: 0.8rem;
                align-items: start;
            }

            .fortune-card2 {
                display: flex;
                flex-direction: column;
                gap: 1.2rem;
            }

            .fortune-item {
                padding: 0.6rem 0.8rem;
                background-color: var(--b3-theme-surface);
                border-radius: 8px;
                font-size: 14px;
                transition: background-color 0.2s ease;
                break-inside: avoid;
                display: flex;
                flex-direction: column;
                border-left: 3px solid var(--b3-theme-primary);

                h4 {
                    font-weight: 600;
                    margin-bottom: 0.4rem;
                    color: var(--b3-theme-on-surface);
                    font-size: 15px;
                }

                p {
                    margin: 0;
                    line-height: 1.5;
                    color: var(--b3-theme-on-surface-light);
                }

                span {
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