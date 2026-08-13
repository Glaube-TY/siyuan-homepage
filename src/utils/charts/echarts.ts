import * as echarts from "echarts/core";
import {
    BarChart,
    CustomChart,
    LineChart,
    PieChart,
    ScatterChart,
} from "echarts/charts";
import {
    CalendarComponent,
    DataZoomComponent,
    GraphicComponent,
    GridComponent,
    LegendComponent,
    MarkLineComponent,
    TitleComponent,
    ToolboxComponent,
    TooltipComponent,
    VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
    BarChart,
    CustomChart,
    LineChart,
    PieChart,
    ScatterChart,
    CalendarComponent,
    DataZoomComponent,
    GraphicComponent,
    GridComponent,
    LegendComponent,
    MarkLineComponent,
    TitleComponent,
    ToolboxComponent,
    TooltipComponent,
    VisualMapComponent,
    CanvasRenderer,
]);

export * from "echarts/core";
export type { EChartsOption } from "echarts";
