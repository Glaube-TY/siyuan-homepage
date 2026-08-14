import * as echarts from "echarts/core";
import {
    BarChart,
    CustomChart,
    FunnelChart,
    GaugeChart,
    HeatmapChart,
    LineChart,
    PieChart,
    RadarChart,
    ScatterChart,
    SunburstChart,
    TreemapChart,
} from "echarts/charts";
import {
    CalendarComponent,
    DataZoomComponent,
    DatasetComponent,
    GraphicComponent,
    GridComponent,
    LegendComponent,
    MarkLineComponent,
    RadarComponent,
    TitleComponent,
    ToolboxComponent,
    TooltipComponent,
    TransformComponent,
    VisualMapComponent,
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
    BarChart,
    CustomChart,
    FunnelChart,
    GaugeChart,
    HeatmapChart,
    LineChart,
    PieChart,
    RadarChart,
    ScatterChart,
    SunburstChart,
    TreemapChart,
    CalendarComponent,
    DataZoomComponent,
    DatasetComponent,
    GraphicComponent,
    GridComponent,
    LegendComponent,
    MarkLineComponent,
    RadarComponent,
    TitleComponent,
    ToolboxComponent,
    TooltipComponent,
    TransformComponent,
    VisualMapComponent,
    LabelLayout,
    UniversalTransition,
    CanvasRenderer,
]);

export * from "echarts/core";
export type { EChartsOption } from "echarts";
