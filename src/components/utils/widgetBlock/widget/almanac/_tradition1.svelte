<script lang="ts">
    import {
        getSolarDay,
        getLunarDay,
        getLunarSeason,
        getSolarTerm,
        getZodiac,
        getPhase,
        getSixtyCycle,
        getPengZu,
        getFetusMonth,
        getTaboo,
        getGod,
    } from "@/components/tools/calendarCalculation";

    const solarDay = getSolarDay();
    const lunarDay = getLunarDay();
    const lunarSeason = getLunarSeason();
    const solarTerm = getSolarTerm();
    const zodiac = getZodiac();
    const phase = getPhase();
    const sixtyCycle = getSixtyCycle();
    const pengZu = getPengZu();
    const fetusMonth = getFetusMonth();
    const taboo = getTaboo();
    const god = getGod();
</script>

<div class="content-display-tradition1">
    <svg viewBox="0 0 100 150">
        <rect x="0" y="0" width="100" height="150" fill="#E7D9C0" />

        <text
            x="50"
            y="8"
            font-size="6"
            font-weight="bold"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            {solarDay.yearNum}年{solarDay.monthNum}月{solarDay.dayNum}日 星期{solarDay.weekCN}
        </text>

        <line
            x1="5"
            y1="12"
            x2="95"
            y2="12"
            stroke="#7D4141"
            stroke-width="0.5"
        />

        <text
            x="50"
            y="55"
            font-size="40"
            font-weight="bold"
            fill="#7D4141"
            text-anchor="middle"
        >
            {solarDay.dayNum}
        </text>

        <text
            x="50"
            y="65"
            font-size="8"
            font-weight="bold"
            fill="#7D4141"
            text-anchor="middle"
        >
            {lunarDay.lunarMonthStr}月 {lunarDay.lunarDayStr}
        </text>

        <text
            x="50"
            y="73"
            font-size="6"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            <tspan>{sixtyCycle.sixtyCycleYearStr}</tspan>
            <tspan dx="1">{sixtyCycle.sixtyCycleMonthStr}</tspan>
            <tspan dx="1">{sixtyCycle.sixtyCycleDayStr}</tspan>
        </text>

        <text
            x="50"
            y="81"
            font-size="6"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            <tspan>{zodiac.zodiac}</tspan>
            <tspan dx="1">{solarTerm.termStr}</tspan>
            <tspan dx="1">{lunarSeason.lunarSeasonStr}</tspan>
        </text>

        <text
            x="50"
            y="89"
            font-size="6"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            {phase.lunarPhaseStr}
        </text>

        <circle cx="25" cy="103" r="4" fill="#25A84E" />
        <text
            x="25"
            y="103.5"
            font-size="4"
            fill="white"
            text-anchor="middle"
            dominant-baseline="middle"
        >
            宜
        </text>

        <foreignObject x="5" y="110" width="40" height="30">
            <div
                style="font-size: 3.5px; color: #7D4141; text-align: center; line-height: 1.2; word-wrap: break-word; overflow-wrap: break-word; font-family: 宋体;"
            >
                {taboo.taboosDayStr}
            </div>
        </foreignObject>

        <line
            x1="50"
            y1="103"
            x2="50"
            y2="123"
            stroke="#7D4141"
            stroke-width="0.1"
        />

        <circle cx="75" cy="103" r="4" fill="#E84E4C" />
        <text
            x="75"
            y="103.5"
            font-size="4"
            fill="white"
            text-anchor="middle"
            dominant-baseline="middle"
        >
            忌
        </text>

        <foreignObject x="55" y="110" width="40" height="30">
            <div
                style="font-size: 3.5px; color: #7D4141; text-align: center; line-height: 1.2; word-wrap: break-word; overflow-wrap: break-word; font-family: 宋体;"
            >
                {taboo.taboosDay2Str}
            </div>
        </foreignObject>

        <line
            x1="5"
            y1="125"
            x2="95"
            y2="125"
            stroke="#7D4141"
            stroke-width="0.1"
            text-anchor="middle"
        />

        <text
            x="20"
            y="130"
            font-size="4"
            font-weight="bold"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            彭祖百忌
        </text>
        <text
            x="20"
            y="137"
            font-size="3.5"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            {pengZu.pengZuDayStr.split(" ").slice(0, 1)}
        </text>
        <text
            x="20"
            y="142"
            font-size="3.5"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            {pengZu.pengZuDayStr.split(" ").slice(-1)}
        </text>

        <text
            x="55"
            y="130"
            font-size="4"
            font-weight="bold"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            吉神宜趋
        </text>
        <foreignObject x="35" y="132" width="40" height="30">
            <div
                style="font-size: 3.5px; color: #7D4141; text-align: center; line-height: 1.2; word-wrap: break-word; overflow-wrap: break-word; font-family: 宋体;"
            >
                {god.goodGodsStr}
            </div>
        </foreignObject>

        <text
            x="85"
            y="130"
            font-size="4"
            font-weight="bold"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            逐月胎神
        </text>
        <text
            x="85"
            y="140"
            font-size="3.5"
            font-family="宋体"
            fill="#7D4141"
            text-anchor="middle"
        >
            {fetusMonth.fetusMonthStr}
        </text>
    </svg>
</div>

<style lang="scss">
    .content-display-tradition1 {
        width: 100%;
        height: 100%;
    }
</style>
