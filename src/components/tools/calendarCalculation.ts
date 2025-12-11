import { SolarDay, SolarTime, LunarYear, LunarDay, LunarMonth, EarthBranch, SixtyCycle, SixtyCycleYear, SixtyCycleMonth, Week, EightChar, LunarHour } from "tyme4ts";

const currentTime = new Date();
const year = currentTime.getFullYear().toString(); // 年份
const month = (currentTime.getMonth() + 1).toString(); // 月份
const day = currentTime.getDate().toString(); // 日期
const hour = currentTime.getHours().toString(); // 小时
const minute = currentTime.getMinutes().toString(); // 分钟
const second = currentTime.getSeconds().toString(); // 秒
const week = currentTime.getDay().toString(); // 星期
const quarter = Math.ceil(parseInt(month) / 3).toString(); // 季度

// 获取阳历日期
export function getSolarDay() {
    return {
        yearNum: year, // 年份（数字）
        yearNumShort: year.slice(-2), // 年份（数字，后两位）
        yearCN: numberToChinese(year), // 年份（中文）
        yearCNShort: numberToChinese(year.slice(-2)), // 年份（中文，后两位）
        monthNum: month, // 月份（数字）
        monthCN: monthDayToChinese(month), // 月份（中文）
        monthEN: monthToEnglish(month), // 月份（英文）
        monthENShort: monthToEnglishShort(month), // 月份（英文缩写）
        dayNum: day, // 日期（数字）
        dayCN: monthDayToChinese(day), // 日期（中文）
        week: week, // 星期（数字）
        weekCN: numberToChinese(week), // 星期（中文）
        weekEN: weekToEnglish(week), // 星期（英文）
        weekENShort: weekToEnglishShort(week), // 星期（英文缩写）
        quarterNum: quarter, // 季度（数字）
        quarterCN: numberToChinese(quarter) // 季度（中文）
    };

    // 数字转中文（年份用，逐位转换）
    function numberToChinese(numStr: string): string {
        const digitToCN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        const digits = numStr.split('').map(d => parseInt(d));
        let result = '';

        for (let i = 0; i < digits.length; i++) {
            result += digitToCN[digits[i]];
        }

        return result;
    }

    // 月和日转中文
    function monthDayToChinese(numStr: string): string {
        const num = parseInt(numStr);
        const chineseNumbers = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

        if (num <= 10) {
            return chineseNumbers[num];
        } else if (num < 20) {
            return '十' + chineseNumbers[num % 10];
        } else if (num % 10 === 0) {
            return chineseNumbers[Math.floor(num / 10)] + '十';
        } else {
            return chineseNumbers[Math.floor(num / 10)] + '十' + chineseNumbers[num % 10];
        }
    }

    // 月份转英文
    function monthToEnglish(monthStr: string): string {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthNum = parseInt(monthStr);
        return monthNames[monthNum - 1];
    }

    // 月份转英文缩写
    function monthToEnglishShort(monthStr: string): string {
        const monthShortNames = [
            'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
            'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
        ];
        const monthNum = parseInt(monthStr);
        return monthShortNames[monthNum - 1];
    }

    // 星期转英文
    function weekToEnglish(weekStr: string): string {
        const weekNames = [
            'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
        ];
        const weekNum = parseInt(weekStr);
        return weekNames[weekNum];
    }

    // 星期转英文缩写
    function weekToEnglishShort(weekStr: string): string {
        const weekShortNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const weekNum = parseInt(weekStr);
        return weekShortNames[weekNum];
    }
}


// 使用当前时间创建公历日期
const solarDay: SolarDay = SolarDay.fromYmd(
    Number(year),
    Number(month),
    Number(day),
);
const solarTime: SolarTime = SolarTime.fromYmdHms(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
); // 使用当前时间创建公历时间
const lunarDate: LunarDay = solarDay.getLunarDay(); // 获取农历日期
const lunarDateStr = lunarDate.toString().replace("农历", ""); // 转换为中文格式
const lunarMonth = lunarDate.getMonth(); // 农历月份
const lunarDay = lunarDate.getDay(); // 农历天

// 获取农历日期
export function getLunarDay() {
    return {
        lunarDate: lunarDate, // 农历日期
        lunarDateStr: lunarDateStr, // 农历日期（中文）
        lunarYear: year, // 农历年份
        lunarYearStr: lunarDateStr.slice(0, 3).replace("年", ""), // 农历年份（中文）
        lunarMonth: lunarMonth, // 农历月份
        lunarMonthStr: lunarDateStr.slice(3, 5).replace("月", ""), // 农历月份（中文）
        lunarDay: lunarDay, // 农历天
        lunarDayStr: lunarDateStr.slice(5, 7), // 农历天（中文）
    }
}

// 获取干支日期
export function getSixtyCycle() {
    const sixtyCycleYear = SixtyCycleYear.fromYear(Number(year)); // 干支年
    const sixtyCycleMonth = SixtyCycleMonth.fromIndex(Number(year), Number(lunarMonth)); // 干支月
    const sixtyCycleDay = solarDay.getSixtyCycleDay(); // 干支天
    const sixtyCycleTime = solarTime.getSixtyCycleHour(); // 干支时

    return {
        sixtyCycleYear: sixtyCycleYear, // 干支年
        sixtyCycleYearStr: sixtyCycleYear.toString(), // 干支年（中文）
        sixtyCycleMonth: sixtyCycleMonth, // 干支月
        sixtyCycleMonthStr: sixtyCycleMonth.toString().slice(-3), // 干支月（中文）
        sixtyCycleDay: sixtyCycleDay, // 干支天
        sixtyCycleDayStr: sixtyCycleDay.toString().slice(-3), // 干支天（中文）
        sixtyCycleTime: sixtyCycleTime, // 干支时
        sixtyCycleTimeStr: sixtyCycleTime.toString().slice(-3), // 干支时（中文）
    }
}

// 获取农历季节
export function getLunarSeason() {
    const lunarMonthfun = LunarMonth.fromYm(Number(year), Number(lunarMonth));
    const lunarSeason = lunarMonthfun.getSeason(); // 获取农历季节
    return {
        lunarSeason: lunarSeason, // 农历季节
        lunarSeasonStr: lunarSeason.toString(), // 农历季节（中文）
    }
}

// 获取节气
export function getSolarTerm() {
    const term = solarDay.getTerm(); // 获取节气
    return {
        term: term, // 节气
        termStr: term.toString(), // 节气（中文）
    }
}

// 获取生肖
export function getZodiac() {
    const earthBranchName = lunarDateStr.charAt(1);
    const earthBranch = EarthBranch.fromName(earthBranchName);
    const zodiac = earthBranch.getZodiac().getName();
    return {
        zodiac: zodiac, // 生肖
    }
}

// 获取月相
export function getPhase() {
    const lunarPhase = lunarDate.getPhase(); // 获取农历月相
    return {
        lunarPhase: lunarPhase, // 农历月相
        lunarPhaseStr: lunarPhase.toString(), // 农历月相（中文）
    }
}

// 获取星座
export function getConstellation() {
    const constellation = solarDay.getConstellation(); // 获取星座
    return {
        constellation: constellation, // 星座
        constellationStr: constellation.toString(), // 星座（中文）
    }
}

// 获取儒略日
export function getJulianDay() {
    const julianDay = solarDay.getJulianDay(); // 获取儒略日
    return {
        julianDay: julianDay, // 儒略日
        julianDayStr: julianDay.toString(), // 儒略日
    }
}

// 获取三候
export function getThreePhenology() {
    const threePhenology = solarDay.getPhenologyDay().getPhenology().getThreePhenology(); // 获取三候
    return {
        threePhenology: threePhenology, // 三候
        threePhenologyStr: threePhenology.toString(), // 三候（中文）
    }
}

// 获取三伏天
export function getDogDay() {
    const dogDay = solarDay.getDogDay(); // 获取三伏天
    if (dogDay === null) {
        return {
            dogDay: dogDay, // 三伏天
            dogDayStr: "未到", // 三伏天（中文）
        }
    } else {
        return {
            dogDay: dogDay, // 三伏天
            dogDayStr: dogDay.toString(), // 三伏天（中文）
        }
    }
}

// 获取三柱
export function getThreePillars() {
    const threePillars = lunarDate.getThreePillars(); // 获取三柱
    return {
        threePillars: threePillars, // 三柱
        threePillarsStr: threePillars.toString(), // 三柱（中文）
    }
}

// 获取六曜
export function getSixStar() {
    const sixStar = lunarDate.getSixStar(); // 获取六曜
    return {
        sixStar: sixStar, // 六曜
        sixStarStr: sixStar.toString(), // 六曜（中文）
    }
}

// 获取小六壬
export function getMinorRen() {
    const sixteenStar = lunarDate.getMinorRen(); // 获取小六壬
    return {
        sixteenStar: sixteenStar, // 小六壬
        sixteenStarStr: sixteenStar.toString(), // 小六壬（中文）
    }
}

// 获取七曜
export function getSevenStar() {
    const sevenStar = Week.fromIndex(week).getSevenStar(); // 获取七曜
    return {
        sevenStar: sevenStar, // 七曜
        sevenStarStr: sevenStar.toString(), // 七曜（中文）
    }
}

// 获取八字
export function getEightChar() {
    const sixtyCycle = getSixtyCycle();
    const eightChar = new EightChar(sixtyCycle.sixtyCycleYearStr.slice(0, 2), sixtyCycle.sixtyCycleMonthStr.slice(0, 2), sixtyCycle.sixtyCycleDayStr.slice(0, 2), sixtyCycle.sixtyCycleTimeStr.slice(0, 2)); // 获取八字
    return {
        eightChar: eightChar, // 八字
        eightCharStr: eightChar.toString(), // 八字（中文）
    }
}

// 获取九星
export function getNineStar() {
    const nineStarYear = LunarYear.fromYear(year).getNineStar(); // 获取年九星
    const nineStarMonth = LunarMonth.fromYm(Number(year), Number(lunarMonth)).getNineStar(); // 获取月九星
    const nineStarDay = LunarDay.fromYmd(Number(year), Number(lunarMonth), Number(lunarDay)).getNineStar(); // 获取日九星
    const nineStarHour = LunarHour.fromYmdHms(Number(year), Number(lunarMonth), Number(lunarDay), Number(solarTime.getHour()), Number(solarTime.getMinute()), Number(solarTime.getSecond())).getNineStar();
    return {
        nineStarYear: nineStarYear, // 年九星
        nineStarYearStr: nineStarYear.toString(), // 年九星（中文）
        nineStarMonth: nineStarMonth, // 月九星
        nineStarMonthStr: nineStarMonth.toString(), // 月九星（中文）
        nineStarDay: nineStarDay, // 日九星
        nineStarDayStr: nineStarDay.toString(), // 日九星（中文）
        nineStarHour: nineStarHour, // 时九星
        nineStarHourStr: nineStarHour.toString(), // 时九星（中文）
    }
}

// 获取北斗九星
export function getDipper() {
    const dipperYear = LunarYear.fromYear(Number(year)).getNineStar().getDipper();
    const dipperMonth = LunarMonth.fromYm(Number(year), Number(lunarMonth)).getNineStar().getDipper();
    const dipperDay = LunarDay.fromYmd(Number(year), Number(lunarMonth), Number(lunarDay)).getNineStar().getDipper();
    const dipperHour = LunarHour.fromYmdHms(Number(year), Number(lunarMonth), Number(lunarDay), Number(solarTime.getHour()), Number(solarTime.getMinute()), Number(solarTime.getSecond())).getNineStar().getDipper();
    return {
        dipperYear: dipperYear, // 北斗九星
        dipperYearStr: dipperYear.toString(), // 北斗九星（中文）
        dipperMonth: dipperMonth, // 月九星
        dipperMonthStr: dipperMonth.toString(), // 月九星（中文）
        dipperDay: dipperDay, // 日九星
        dipperDayStr: dipperDay.toString(), // 日九星（中文）
        dipperHour: dipperHour, // 时九星
        dipperHourStr: dipperHour.toString(), // 时九星（中文）
    }
}

// 获取数九天
export function getNineDay() {
    const nineDay = solarDay.getNineDay();
    if (nineDay === null) {
        return {
            nineDay: nineDay, // 九天
            nineDayStr: "未到", // 九天（中文）
        }
    } else {
        return {
            nineDay: nineDay, // 九天
            nineDayStr: nineDay.toString(), // 九天（中文）
        }
    }
}

// 建除十二值神
export function getDuty() {
    const duty = LunarDay.fromYmd(Number(year), Number(lunarMonth), Number(lunarDay)).getDuty();
    return {
        duty: duty, // 建除十二值神
        dutyStr: duty.toString(), // 建除十二值神（中文）
    }
}

// 获取七十二候
export function getPhenologyDay() {
    const phenologyDay = solarDay.getPhenologyDay();
    return {
        phenologyDay: phenologyDay, // 七十二候
        phenologyDayStr: phenologyDay.toString(), // 七十二候（中文）
    }
}

// 获取人元司令分野
export function getHideHeavenStemDay() {
    const hideHeavenStemDay = solarDay.getHideHeavenStemDay();
    return {
        hideHeavenStemDay: hideHeavenStemDay, // 人元司令分野
        hideHeavenStemDayStr: hideHeavenStemDay.toString(), // 人元司令分野（中文）
    }
}

// 获取彭祖百忌
export function getPengZu() {
    const sixtyCycle = getSixtyCycle();
    const pengZuDay = SixtyCycle.fromName(sixtyCycle.sixtyCycleDayStr.slice(0, 2)).getPengZu();
    const pengZuTime = SixtyCycle.fromName(sixtyCycle.sixtyCycleTimeStr.slice(0, 2)).getPengZu();
    return {
        pengZuDay: pengZuDay, // 彭祖百忌
        pengZuDayStr: pengZuDay.toString(), // 彭祖百忌（中文）
        pengZuTime: pengZuTime, // 彭祖百忌
        pengZuTimeStr: pengZuTime.toString(), // 彭祖百忌（中文）
    }
}

// 获取运
export function getTwenty() {
    const twenty = LunarYear.fromYear(Number(year)).getTwenty();
    return {
        twenty: twenty, // 运
        twentyStr: twenty.toString(), // 运（中文）
    }
}

// 获取元
export function getSixty() {
    const twenty = getTwenty();
    const sixty = twenty.twenty.getSixty();
    return {
        sixty: sixty, // 元
        sixtyStr: sixty.toString(), // 元（中文）
    }
}

// 获取旬
export function getTen() {
    const sixtyCycle = getSixtyCycle();
    const ten = SixtyCycle.fromName(sixtyCycle.sixtyCycleDayStr.slice(0, 2)).getTen();;
    return {
        ten: ten, // 旬
        tenStr: ten.toString(), // 旬（中文）
    }
}

// 获取梅雨天
export function getPlumRainDay() {
    const plumRainDay = solarDay.getPlumRainDay();
    if (plumRainDay === null) {
        return {
            plumRainDay: plumRainDay, // 梅雨天
            plumRainDayStr: "未到", // 梅雨天（中文）
        }
    } else {
        return {
            plumRainDay: plumRainDay, // 梅雨天
            plumRainDayStr: plumRainDay.toString(), // 梅雨天（中文）
        }
    }
}

// 获取逐月胎神
export function getFetusMonth() {
    const fetus = LunarMonth.fromYm(Number(year), Number(lunarMonth)).getFetus();
    return {
        fetusMonth: fetus, // 逐月胎神
        fetusMonthStr: fetus.toString(), // 逐月胎神（中文）
    }
}

// 获取逐日胎神
export function getFetusDay() {
    const fetus = LunarDay.fromYmd(Number(year), Number(lunarMonth), Number(lunarDay)).getFetusDay();
    return {
        fetusDay: fetus, // 逐日胎神
        fetusDayStr: fetus.toString(), // 逐日胎神（中文）
    }
}

// 获取灶马头
export function getKitchenGodSteed() {
    const kitchenGodSteed = LunarYear.fromYear(Number(year)).getKitchenGodSteed();
    return {
        kitchenGodSteed: kitchenGodSteed, // 灶马头
        kitchenGodSteedStr: kitchenGodSteed.toString(), // 灶马头（中文）
        mouse: kitchenGodSteed.getMouse(), // 几鼠偷粮
        grass: kitchenGodSteed.getGrass(), // 草子几分
        cattle: kitchenGodSteed.getCattle(), // 几牛耕田
        flower: kitchenGodSteed.getFlower(), // 花收几分
        dragon: kitchenGodSteed.getDragon(), // 几龙治水
        horse: kitchenGodSteed.getHorse(), // 几马驮谷
        chicken: kitchenGodSteed.getChicken(), // 几鸡抢米
        silkworm: kitchenGodSteed.getSilkworm(), // 几姑看蚕
        pig: kitchenGodSteed.getPig(), // 几屠共猪
        field: kitchenGodSteed.getField(), // 甲田几分
        cake: kitchenGodSteed.getCake(), // 几人分饼
        gold: kitchenGodSteed.getGold(), // 几日得金
        peopleCakes: kitchenGodSteed.getPeopleCakes(), // 几人几丙
        peopleHoes: kitchenGodSteed.getPeopleHoes(), // 几人几锄
    }
}

// 获取宜忌
export function getTaboo() {
    const lunarDay = solarDay.getLunarDay();
    const taboosDay1 = lunarDay.getRecommends();
    const taboosDay2 = lunarDay.getAvoids();
    const lunarHour = solarTime.getLunarHour();
    const taboosHour1 = lunarHour.getRecommends();
    const taboosHour2 = lunarHour.getAvoids();
    return {
        taboosDay: taboosDay1, // 日宜
        taboosDayStr: taboosDay1.toString(), // 日宜（中文）
        taboosDay2: taboosDay2, // 日忌
        taboosDay2Str: taboosDay2.toString(), // 日忌（中文）
        taboosHour: taboosHour1, // 时宜
        taboosHourStr: taboosHour1.toString(), // 时宜（中文）
        taboosHour2: taboosHour2, // 时忌
        taboosHour2Str: taboosHour2.toString(), // 时忌（中文）
    }
}

// 获取神煞
export function getGod() {
    const lunarDay = solarDay.getLunarDay();
    const gods = lunarDay.getGods();
    const goodGods = []; // 吉神宜趋
    const badGods = []; // 凶神宜忌
    
    // 遍历，根据神煞吉凶区分吉神和凶神
    for (const god of gods) {
        if ("吉" === god.getLuck().getName()) {
            goodGods.push(god);
        } else {
            badGods.push(god);
        }
    }
    
    return {
        gods: gods, // 当天的神煞列表
        godsStr: gods.toString(), // 当天的神煞列表（中文）
        goodGods: goodGods, // 吉神宜趋
        goodGodsStr: goodGods.toString(), // 吉神宜趋（中文）
        badGods: badGods, // 凶神宜忌
        badGodsStr: badGods.toString(), // 凶神宜忌（中文）
    }
}
