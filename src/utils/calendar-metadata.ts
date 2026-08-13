import { SolarDay } from "tyme4ts";

export interface CalendarDateMetadata {
  lunarDayName: string;
  solarTermName?: string;
  solarFestivalName?: string;
  lunarFestivalName?: string;
  legalHolidayName?: string;
}

export function getCalendarDateMetadata(date: Date): CalendarDateMetadata {
  try {
    const solarDay = SolarDay.fromYmd(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    );
    const lunarDay = solarDay.getLunarDay();
    const termDay = solarDay.getTermDay();
    return {
      lunarDayName: lunarDay.getName(),
      solarTermName:
        termDay.getDayIndex() === 0
          ? termDay.getSolarTerm().getName()
          : undefined,
      solarFestivalName: solarDay.getFestival()?.getName(),
      lunarFestivalName: lunarDay.getFestival()?.getName(),
      legalHolidayName: solarDay.getLegalHoliday()?.getName(),
    };
  } catch {
    return { lunarDayName: "" };
  }
}
