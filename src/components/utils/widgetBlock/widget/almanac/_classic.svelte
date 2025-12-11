<script lang="ts">
    import {
        getSolarDay,
        getLunarDay,
        getLunarSeason,
        getSolarTerm,
        getZodiac,
        getPhase,
        getConstellation,
        getSixtyCycle,
        getJulianDay,
        getThreePhenology,
        getDogDay,
        getThreePillars,
        getSixStar,
        getMinorRen,
        getSevenStar,
        getEightChar,
        getNineStar,
        getDipper,
        getNineDay,
        getDuty,
        getPhenologyDay,
        getHideHeavenStemDay,
        getPengZu,
        getTwenty,
        getSixty,
        getTen,
        getPlumRainDay,
        getFetusMonth,
        getFetusDay,
        getKitchenGodSteed,
        getTaboo,
        getGod,
    } from "@/components/tools/calendarCalculation";

    const solarDay = getSolarDay();
    const lunarDay = getLunarDay();
    const lunarSeason = getLunarSeason();
    const solarTerm = getSolarTerm();
    const zodiac = getZodiac();
    const phase = getPhase();
    const constellation = getConstellation();
    const sixtyCycle = getSixtyCycle();
    const julianDay = getJulianDay();
    const threePhenology = getThreePhenology();
    const dogDay = getDogDay();
    const threePillars = getThreePillars();
    const sixStar = getSixStar();
    const sixteenStar = getMinorRen();
    const sevenStar = getSevenStar();
    const eightChar = getEightChar();
    const nineStar = getNineStar();
    const dipper = getDipper();
    const nineDay = getNineDay();
    const duty = getDuty();
    const phenologyDay = getPhenologyDay();
    const hideHeavenStemDay = getHideHeavenStemDay();
    const pengZu = getPengZu();
    const twenty = getTwenty();
    const sixty = getSixty();
    const ten = getTen();
    const plumRainDay = getPlumRainDay();
    const fetusMonth = getFetusMonth();
    const fetusDay = getFetusDay();
    const kitchenGodSteed = getKitchenGodSteed();
    const taboo = getTaboo();
    const god = getGod();
</script>

<div class="content-display-classic">
    <table>
        <tr>
            <td colspan="2">公历日期</td>
            <td colspan="2"
                >{solarDay.yearCN}年{solarDay.monthCN}月{solarDay.dayCN}日</td
            >
        </tr>
        <tr>
            <td colspan="2">农历日期</td>
            <td colspan="2">{lunarDay.lunarDateStr}</td>
        </tr>
        <tr>
            <td colspan="2">干支日期</td>
            <td colspan="2">
                {sixtyCycle.sixtyCycleYearStr}
                {sixtyCycle.sixtyCycleMonthStr}
                {sixtyCycle.sixtyCycleDayStr}
                {sixtyCycle.sixtyCycleTimeStr}
            </td>
        </tr>
        <tr>
            <td colspan="2">节气</td>
            <td>{solarTerm.termStr}</td>
        </tr>
        <tr>
            <td colspan="2">农历季节</td>
            <td>{lunarSeason.lunarSeasonStr}</td>
        </tr>
        <tr>
            <td colspan="2">生肖</td>
            <td>{zodiac.zodiac}</td>
        </tr>
        <tr>
            <td colspan="2">星座</td>
            <td>{constellation.constellationStr}</td>
        </tr>
        <tr>
            <td colspan="2">月相</td>
            <td>{phase.lunarPhaseStr}</td></tr
        >
        <tr>
            <td colspan="2">三伏天</td>
            <td>{dogDay.dogDayStr}</td>
        </tr>
        <tr>
            <td colspan="2">梅雨天</td>
            <td>{plumRainDay.plumRainDayStr}</td>
        </tr>
        <tr>
            <td colspan="2">数九天</td>
            <td>{nineDay.nineDayStr}</td>
        </tr>
        <tr>
            <td colspan="2">儒略日</td>
            <td>{julianDay.julianDayStr}</td>
        </tr>
        <tr>
            <td colspan="2">三候</td>
            <td>{threePhenology.threePhenologyStr}</td>
        </tr>
        <tr>
            <td colspan="2">三柱</td>
            <td>{threePillars.threePillarsStr}</td>
        </tr>
        <tr>
            <td colspan="2">六曜</td>
            <td>{sixStar.sixStarStr}</td>
        </tr>
        <tr>
            <td colspan="2">七曜</td>
            <td>{sevenStar.sevenStarStr}</td>
        </tr>
        <tr>
            <td colspan="2">小六壬</td>
            <td>{sixteenStar.sixteenStarStr}</td>
        </tr>
        <tr>
            <td colspan="2">八字</td>
            <td>{eightChar.eightCharStr}</td>
        </tr>
        <tr>
            <td rowspan="4">九星</td>
            <td style="color: black;">年</td>
            <td>{nineStar.nineStarYearStr} </td>
        </tr>
        <tr>
            <td>月</td>
            <td> {nineStar.nineStarMonthStr}</td>
        </tr>
        <tr>
            <td>日</td>
            <td> {nineStar.nineStarDayStr}</td>
        </tr>
        <tr>
            <td>时</td>
            <td> {nineStar.nineStarHourStr}</td>
        </tr>
        <tr>
            <td rowspan="4">北斗九星</td>
            <td style="color: black;">年</td>
            <td>{dipper.dipperYearStr}</td>
        </tr>
        <tr>
            <td>月</td>
            <td> {dipper.dipperMonthStr}</td>
        </tr>
        <tr>
            <td>日</td>
            <td> {dipper.dipperDayStr}</td>
        </tr>
        <tr>
            <td>时</td>
            <td> {dipper.dipperHourStr}</td>
        </tr>
        <tr>
            <td colspan="2">逐月胎神</td>
            <td>{fetusMonth.fetusMonthStr}</td>
        </tr>
        <tr>
            <td colspan="2">逐日胎神</td>
            <td colspan="2">{fetusDay.fetusDayStr}</td>
        </tr>
        <tr>
            <td colspan="2">建除十二值神</td>
            <td>{duty.dutyStr}</td>
        </tr>
        <tr>
            <td colspan="2">七十二候</td>
            <td>{phenologyDay.phenologyDayStr}</td>
        </tr>
        <tr>
            <td colspan="2">人元司令分野</td>
            <td>{hideHeavenStemDay.hideHeavenStemDayStr}</td>
        </tr>
        <tr>
            <td rowspan="2">彭祖百忌</td>
            <td style="color: black;">日百忌</td>
            <td>{pengZu.pengZuDayStr}</td>
        </tr>
        <tr>
            <td>时百忌</td>
            <td>{pengZu.pengZuTimeStr}</td>
        </tr>
        <tr>
            <td rowspan="14" colspan="2">灶马头</td>
            <td>{kitchenGodSteed.mouse}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.grass}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.cattle}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.flower}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.dragon}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.horse}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.chicken}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.silkworm}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.pig}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.field}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.cake}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.gold}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.peopleCakes}</td>
        </tr>
        <tr>
            <td>{kitchenGodSteed.peopleHoes}</td>
        </tr>
        <tr>
            <td rowspan="4">宜忌</td>
            <td style="color: black;">日宜</td>
            <td colspan="2">{taboo.taboosDayStr}</td>
        </tr>
        <tr>
            <td>日忌</td>
            <td colspan="2">{taboo.taboosDay2Str}</td>
        </tr>
        <tr>
            <td>时宜</td>
            <td colspan="2">{taboo.taboosHourStr}</td>
        </tr>
        <tr>
            <td>时忌</td>
            <td colspan="2">{taboo.taboosHour2Str}</td>
        </tr>
        <tr>
            <td rowspan="2">神煞</td>
            <td style="color: black;">吉神宜趋</td>
            <td colspan="2">{god.goodGodsStr}</td>
        </tr>
        <tr>
            <td>凶神宜忌</td>
            <td colspan="2">{god.badGodsStr}</td>
        </tr>
        <tr>
            <td colspan="2">运</td>
            <td>{twenty.twentyStr}</td>
        </tr>
        <tr>
            <td colspan="2">元</td>
            <td>{sixty.sixtyStr}</td>
        </tr>
        <tr>
            <td colspan="2">旬</td>
            <td>{ten.tenStr}</td>
        </tr>
    </table>
</div>

<style lang="scss">
    .content-display-classic {
        width: calc(100% - 1rem);
        height: 100%;
        padding: 1rem;
        overflow: auto;

        table {
            width: 100%;
            border-collapse: collapse;
        }

        td {
            font-weight: 600;
            border: 1.5px solid #000;
            padding: 0.5rem;
            text-align: center;
        }

        td:nth-child(2),
        td:nth-child(3) {
            color: var(--b3-theme-primary);
        }
    }
</style>
