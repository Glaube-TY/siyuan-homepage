import { mount } from "svelte";
import latestDocs from "./widget/latestDocs/latestDocs.svelte";
import latestDailyNotes from "./widget/latestDailyNotes/latestDailyNotes.svelte";
import TaskMan from "./widget/tasks/recentTasks.svelte";
import countdown from "./widget/countdown/countdown.svelte";
import weather from "./widget/weather/weather.svelte";
import HOT from "./widget/HOT/HOT.svelte";
import favorites from "./widget/favorites/favorites.svelte";
import heatmap from "./widget/heatmap/heatmap.svelte";
import customText from "./widget/customText/customText.svelte";
import customWeb from "./widget/webview/webview.svelte";
import customProtyle from "./widget/protyle/protyle.svelte";
import timedate from "./widget/timedate/timedate.svelte";
import focus from "./widget/focus/focus.svelte";
import sql from "./widget/sql/sql.svelte";
import TaskManPlus from "./widget/tasksPlus/tasksPlus.svelte";
import quickNotes from "./widget/quickNotes/quickNotes.svelte";
import dailyQuote from "./widget/dailyQuote/dailyQuote.svelte";
import visualChart from "./widget/visualChart/visualChart.svelte";
import musicPlayer from "./widget/musicPlayer/musicPlayer.svelte";
import Stikynot from "./widget/stikynot/stikynot.svelte";
import News from "./widget/News/News.svelte";
import databaseChart from "./widget/databaseChart/databaseChart.svelte";
import childDocs from "./widget/childDocs/childDocs.svelte";
import constellation from "./widget/constellation/constellation.svelte";
import historyDays from "./widget/historyDays/historyDays.svelte";
import statisticalCard from "./widget/statisticalCard/statisticalCard.svelte";
import almanac from "./widget/almanac/almanac.svelte";
import PicCaro from "./widget/PicCaro/PicCaro.svelte";
import CYBMOK from "./widget/CYBMOK/CYBMOK.svelte";
import countdownTimer from "./widget/countdownTimer/countdownTimer.svelte";
import conditionDocs from "./widget/conditionDocs/conditionDocs.svelte";

const widgetRegistry: Record<string, any> = {
    "latest-docs": latestDocs,
    "heatmap": heatmap,
    "favorites": favorites,
    "recent-journals": latestDailyNotes,
    "TaskMan": TaskMan,
    "countdown": countdown,
    "weather": weather,
    "HOT": HOT,
    "custom-text": customText,
    "custom-web": customWeb,
    "custom-protyle": customProtyle,
    "timedate": timedate,
    "focus": focus,
    "sql": sql,
    "TaskManPlus": TaskManPlus,
    "quick-notes": quickNotes,
    "dailyQuote": dailyQuote,
    "visualChart": visualChart,
    "musicPlayer": musicPlayer,
    "stikynot": Stikynot,
    "News": News,
    "databaseChart": databaseChart,
    "childDocs": childDocs,
    "constellation": constellation,
    "historyDays": historyDays,
    "statisticalCard": statisticalCard,
    "almanac": almanac,
    "PicCaro": PicCaro,
    "CYBMOK": CYBMOK,
    "countdownTimer": countdownTimer,
    "conditionDocs": conditionDocs,
};

const widgetNeedsPlugin: Set<string> = new Set([
    "latest-docs",
    "heatmap",
    "favorites",
    "recent-journals",
    "TaskMan",
    "weather",
    "custom-protyle",
    "timedate",
    "focus",
    "sql",
    "TaskManPlus",
    "quick-notes",
    "dailyQuote",
    "visualChart",
    "musicPlayer",
    "stikynot",
    "News",
    "databaseChart",
    "childDocs",
    "constellation",
    "historyDays",
    "statisticalCard",
    "almanac",
    "PicCaro",
    "CYBMOK",
    "countdownTimer",
    "conditionDocs",
]);

export function mountWidgetContent(
    target: HTMLElement,
    plugin: any,
    contentTypeJson: string
): Record<string, any> | null {
    let contentData: any;

    try {
        contentData = JSON.parse(contentTypeJson);
    } catch (e) {
        console.error("无法解析 JSON 数据", e);
        return null;
    }

    const widgetType = contentData.type;
    const widgetComponent = widgetRegistry[widgetType];

    if (!widgetComponent) {
        console.warn(`未知的 widget 类型: ${widgetType}`);
        return null;
    }

    const props: Record<string, any> = {
        contentTypeJson: contentTypeJson,
    };

    if (widgetNeedsPlugin.has(widgetType)) {
        props.plugin = plugin;
    }

    return mount(widgetComponent, {
        target: target,
        props: props,
    });
}