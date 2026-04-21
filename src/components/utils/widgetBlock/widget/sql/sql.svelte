<script lang="ts">
    import { sql, lsNotebooks } from "@/api";
    import { onMount } from "svelte";
    import { openDocs } from "@/components/tools/openDocs";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    const parsed = JSON.parse(contentTypeJson);
    let sqlTitle = parsed.data?.sqlTitle || "🔍SQL 查询结果";
    const sqlInput = parsed.data?.sqlInput || "";
    const columnOrder =
        parsed.data?.columnOrder
            ?.replace(/，/g, ",")
            .split(",")
            .map((s) => s.trim()) || [];

    let data: any[] = [];
    let filteredData: any[] = $state([]);
    let notebooksList: any[] = [];

    let hiddenFields =
        parsed.data?.hiddenFields
            ?.replace(/，/g, ",")
            .split(",")
            .map((s) => s.trim()) || [];
    let hiddenProperties: Record<string, any> = {};

    const fieldNameMap = {
        id: "内容块ID",
        parent_id: "上级块ID",
        root_id: "顶层块ID",
        box: "笔记本",
        path: "文档路径（机器）",
        hpath: "文档路径",
        name: "内容块名称",
        alias: "内容块别名",
        memo: "内容块备注",
        tag: "标签",
        content: "内容",
        fcontent: "首子块内容",
        markdown: "Markdown内容",
        length: "文本长度",
        type: "类型",
        subtype: "子类型",
        ial: "内联属性",
        sort: "排序权重",
        created: "创建时间",
        updated: "更新时间",
    };

    const typeMap = {
        audio: "音频",
        av: "属性表",
        b: "引述",
        c: "代码",
        d: "文档",
        h: "标题",
        html: "HTML",
        i: "列表项",
        iframe: "iframe",
        l: "列表",
        m: "公式",
        p: "段落",
        query_embed: "嵌入",
        s: "超级",
        t: "表格",
        tb: "分割线",
        video: "视频",
        widget: "挂件",
    };

    function processItem(item: any) {
        const notebookName =
            notebooksList.find((n) => n.id === item.box)?.name || item.box;

        const [visiblePart, hiddenPart] = Object.entries(item).reduce(
            ([vis, hid], [key, value]) => {
                if (hiddenFields.includes(key)) {
                    hid[key] = value;
                    return [vis, hid];
                }

                if (key === "box") {
                    vis[key] = notebookName;
                } else {
                    vis[key] = value;
                }
                return [vis, hid];
            },
            [{}, {}] as [Record<string, any>, Record<string, any>],
        );

        hiddenProperties = hiddenPart;

        return Object.entries(visiblePart).reduce(
            (acc, [key, value]) => {
                const chineseKey = fieldNameMap[key] || key;
                const formattedValue =
                    key === "created" || key === "updated"
                        ? formatTimestamp(value as string)
                        : value;

                acc[chineseKey] =
                    key === "type"
                        ? typeMap[value as string] || value
                        : formattedValue;
                return acc;
            },
            {} as Record<string, any>,
        );
    }

    async function runSql() {
        const result = await sql(sqlInput);
        data = result;
        filteredData = result.map(processItem);
    }

    async function getNotebooks() {
        const result = await lsNotebooks();
        notebooksList = result.notebooks || [];
    }

    function formatTimestamp(ts: string): string {
        if (!ts || ts.length !== 14) return ts;

        const year = ts.substring(0, 4);
        const month = ts.substring(4, 6);
        const day = ts.substring(6, 8);
        const hour = ts.substring(8, 10);
        const minute = ts.substring(10, 12);
        const second = ts.substring(12, 14);

        return `${year}年${month}月${day}日 ${hour}:${minute}:${second}`;
    }

    function openDocument(id: string) {
        openDocs(plugin, id);
    }

    function getSortedColumns(item: Record<string, any>) {
        const allKeys = Object.keys(item);
        const orderedKeys = columnOrder
            .map((k) => fieldNameMap[k] || k)
            .filter((k) => !hiddenFields.includes(k) && allKeys.includes(k));
        const remainingKeys = allKeys.filter(
            (k) => !orderedKeys.includes(k) && !hiddenFields.includes(k),
        );

        return [...orderedKeys, ...remainingKeys];
    }

    onMount(async () => {
        await getNotebooks();
        runSql();
    });
</script>

<div class="content-display">
    <h3 class="widget-title">{sqlTitle}</h3>
    <div class="sql-display-content">
        {#if filteredData.length > 0}
            <table class="sql-table">
                <thead>
                    <tr>
                        {#if filteredData[0]}
                            {#each getSortedColumns(filteredData[0]) as key}
                                <th>{key}</th>
                            {/each}
                        {/if}
                    </tr>
                </thead>
                <tbody>
                    {#each filteredData as row}
                        <tr>
                            {#each getSortedColumns(row) as key}
                                <td
                                    class={key === "文档路径"
                                        ? "clickable-path"
                                        : ""}
                                    onclick={key === "文档路径"
                                        ? () => openDocument(row["内容块ID"])
                                        : null}
                                >
                                    {row[key] || "-"}
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        {:else}
            <p>无查询结果</p>
        {/if}
    </div>
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

        .sql-display-content {
            width: 100%;
            height: 100%;
            overflow: auto;

            .sql-table {
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                border-radius: 8px;
                overflow: hidden;
                table-layout: fixed;

                th,
                td {
                    padding: 8px 12px;
                    border: 1px solid var(--b3-border-color);
                    max-width: 300px;
                    white-space: nowrap;
                    user-select: text;
                }

                th {
                    position: sticky;
                    text-align: center;
                    top: 0;
                    z-index: 1;
                    font-weight: 600;
                    text-transform: capitalize;
                    color: var(--b3-theme-primary);
                    border-bottom: 2px solid var(--b3-border-color);
                }

                td {
                    text-align: left;
                    transition: background-color 0.2s;
                    overflow: auto;
                }

                tr:last-child td {
                    border-bottom: none;
                }

                .clickable-path {
                    color: var(--b3-theme-primary);
                    text-decoration: underline;

                    &:hover {
                        color: var(--b3-list-hover);
                        cursor: pointer;
                    }
                }
            }

            // 空状态提示美化
            p {
                text-align: center;
                color: var(--text-secondary);
                padding: 1.5rem;
                font-style: italic;
            }
        }
    }
</style>
