import { LunarDay, LunarMonth, SolarDay } from "tyme4ts";
import type {
  CountdownDisplayPreferences,
  CountdownEventRecord,
  CountdownOccurrence,
} from "./countdownTypes";

const DAY_MS = 86_400_000;
const lunarCache = new Map<string, Date | null>();

export function parseLocalSolarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = new Date(year, month - 1, day);
  return result.getFullYear() === year &&
    result.getMonth() === month - 1 &&
    result.getDate() === day
    ? result
    : null;
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatCountdownSolarDate(
  value: string,
  preferences: Pick<CountdownDisplayPreferences, "dateFormat" | "showWeekday">,
  includeWeekday = preferences.showWeekday,
): string {
  const date = parseLocalSolarDate(value);
  if (!date) return value;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const formatted =
    preferences.dateFormat === "md"
      ? `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : preferences.dateFormat === "ymd"
        ? formatLocalDate(date)
        : `${year}年${month}月${day}日`;
  return includeWeekday
    ? `${formatted} 周${"日一二三四五六"[date.getDay()]}`
    : formatted;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetweenLocal(from: Date, to: Date): number {
  const a = startOfLocalDay(from);
  const b = startOfLocalDay(to);
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUtc - aUtc) / DAY_MS);
}

export function getLunarYearForSolarDate(date: Date): number | null {
  const local = startOfLocalDay(date);
  if (!Number.isFinite(local.getTime())) return null;
  try {
    return SolarDay.fromYmd(
      local.getFullYear(),
      local.getMonth() + 1,
      local.getDate(),
    )
      .getLunarDay()
      .getYear();
  } catch {
    return null;
  }
}

function validSolarOccurrence(
  event: CountdownEventRecord,
  year: number,
): Date | null {
  const original = event.date ? parseLocalSolarDate(event.date) : null;
  if (!original) return null;
  if (year < original.getFullYear()) return null;
  const month = original.getMonth() + 1;
  const day = original.getDate();
  if (month === 2 && day === 29) {
    const leap = new Date(year, 1, 29).getMonth() === 1;
    if (!leap && event.solarLeapDayPolicy === "skip") return null;
    if (!leap)
      return event.solarLeapDayPolicy === "mar1"
        ? new Date(year, 2, 1)
        : new Date(year, 1, 28);
  }
  return new Date(year, month - 1, day);
}

function lunarToSolar(
  event: CountdownEventRecord,
  lunarYear: number,
): Date | null {
  const lunar = event.lunarDate;
  if (!lunar) return null;
  if (lunarYear < lunar.year) return null;
  const cacheKey = `${event.id}|${lunarYear}|${lunar.month}|${lunar.day}|${lunar.isLeapMonth}|${event.lunarLeapMonthPolicy}|${event.lunarMissingDayPolicy}`;
  if (lunarCache.has(cacheKey)) return lunarCache.get(cacheKey) ?? null;
  try {
    let monthWithLeap = lunar.isLeapMonth
      ? -Math.abs(lunar.month)
      : Math.abs(lunar.month);
    let month: LunarMonth;
    try {
      month = LunarMonth.fromYm(lunarYear, monthWithLeap);
    } catch {
      if (!lunar.isLeapMonth || event.lunarLeapMonthPolicy === "exact") {
        lunarCache.set(cacheKey, null);
        return null;
      }
      monthWithLeap = Math.abs(lunar.month);
      month = LunarMonth.fromYm(lunarYear, monthWithLeap);
    }
    let day = lunar.day;
    if (day > month.getDayCount()) {
      if (event.lunarMissingDayPolicy === "skip") {
        lunarCache.set(cacheKey, null);
        return null;
      }
      day = month.getDayCount();
    }
    const solar = LunarDay.fromYmd(lunarYear, monthWithLeap, day).getSolarDay();
    const result = new Date(
      solar.getYear(),
      solar.getMonth() - 1,
      solar.getDay(),
    );
    lunarCache.set(cacheKey, result);
    return result;
  } catch {
    lunarCache.set(cacheKey, null);
    return null;
  }
}

function originalDateLabel(event: CountdownEventRecord): string {
  if (event.calendar === "solar") return event.date ?? "";
  const lunar = event.lunarDate;
  return lunar
    ? `农历 ${lunar.year}年${lunar.isLeapMonth ? "闰" : ""}${lunar.month}月${lunar.day}日`
    : "";
}

export function formatCountdownOriginalDate(
  event: CountdownEventRecord,
  preferences: CountdownDisplayPreferences,
): string {
  return event.calendar === "solar" && event.date
    ? formatCountdownSolarDate(event.date, preferences, false)
    : originalDateLabel(event);
}

export function formatCountdownOccurrenceDate(
  occurrence: CountdownOccurrence,
  preferences: CountdownDisplayPreferences,
): string {
  return formatCountdownSolarDate(
    occurrence.localDate,
    preferences,
    preferences.showWeekday,
  );
}

export function formatCountdownDisplayDate(
  event: CountdownEventRecord,
  occurrence: CountdownOccurrence,
  preferences: CountdownDisplayPreferences,
): string {
  const original = preferences.showOriginalDate
    ? formatCountdownOriginalDate(event, preferences)
    : "";
  const current = preferences.showOccurrenceDate
    ? formatCountdownOccurrenceDate(occurrence, preferences)
    : "";
  if (original && current) {
    const sameSolarDate =
      event.calendar === "solar" && event.date === occurrence.localDate;
    return sameSolarDate ? current : `${original} → ${current}`;
  }
  return original || current;
}

export function getCountdownAnniversaryCount(
  event: CountdownEventRecord,
  occurrence: CountdownOccurrence,
): number | null {
  if (event.recurrence !== "yearly" || event.countLabelMode === "none")
    return null;
  const baseYear =
    event.calendar === "solar"
      ? parseLocalSolarDate(event.date ?? "")?.getFullYear()
      : event.lunarDate?.year;
  if (!baseYear) return null;
  let occurrenceYear = occurrence.occurrenceDate.getFullYear();
  if (event.calendar === "lunar")
    try {
      occurrenceYear = SolarDay.fromYmd(
        occurrence.occurrenceDate.getFullYear(),
        occurrence.occurrenceDate.getMonth() + 1,
        occurrence.occurrenceDate.getDate(),
      )
        .getLunarDay()
        .getYear();
    } catch {
      return null;
    }
  return Math.max(0, occurrenceYear - baseYear);
}

function occurrenceFromDate(
  event: CountdownEventRecord,
  date: Date,
  anchor: Date,
): CountdownOccurrence {
  const daysDelta = daysBetweenLocal(anchor, date);
  const occurrence: CountdownOccurrence = {
    eventId: event.id,
    occurrenceDate: startOfLocalDay(date),
    localDate: formatLocalDate(date),
    daysDelta,
    status: daysDelta === 0 ? "today" : daysDelta > 0 ? "future" : "expired",
    originalDateLabel: originalDateLabel(event),
    occurrenceDateLabel: formatLocalDate(date),
  };
  if (event.calendar === "lunar") {
    try {
      occurrence.lunarDateLabel = SolarDay.fromYmd(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
      )
        .getLunarDay()
        .toString();
    } catch {
      /* noop */
    }
  }
  const count = getCountdownAnniversaryCount(event, occurrence);
  if (count !== null) occurrence.anniversaryCount = count;
  return occurrence;
}

export function resolveCountdownOccurrence(
  event: CountdownEventRecord,
  anchor: Date,
): CountdownOccurrence | null {
  const day = startOfLocalDay(anchor);
  if (event.recurrence === "none") {
    const date =
      event.calendar === "solar"
        ? parseLocalSolarDate(event.date ?? "")
        : lunarToSolar(event, event.lunarDate?.year ?? 0);
    return date ? occurrenceFromDate(event, date, day) : null;
  }
  const anchorYear =
    event.calendar === "lunar"
      ? getLunarYearForSolarDate(day)
      : day.getFullYear();
  if (anchorYear === null) return null;
  // 同一农历闰月可能多年不出现，需覆盖完整闰月回归周期。
  for (let offset = 0; offset <= 40; offset += 1) {
    const year = anchorYear + offset;
    const date =
      event.calendar === "solar"
        ? validSolarOccurrence(event, year)
        : lunarToSolar(event, year);
    if (date && daysBetweenLocal(day, date) >= 0)
      return occurrenceFromDate(event, date, day);
  }
  return null;
}

export function getCountdownOccurrencesInRange(
  event: CountdownEventRecord,
  start: Date,
  end: Date,
): CountdownOccurrence[] {
  const first = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  if (last < first) return [];
  if (event.recurrence === "none") {
    const occurrence = resolveCountdownOccurrence(event, first);
    return occurrence &&
      occurrence.occurrenceDate >= first &&
      occurrence.occurrenceDate <= last
      ? [occurrence]
      : [];
  }
  const results: CountdownOccurrence[] = [];
  const firstYear =
    event.calendar === "lunar"
      ? getLunarYearForSolarDate(first)
      : first.getFullYear();
  const lastYear =
    event.calendar === "lunar"
      ? getLunarYearForSolarDate(last)
      : last.getFullYear();
  if (firstYear === null || lastYear === null) return [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const date =
      event.calendar === "solar"
        ? validSolarOccurrence(event, year)
        : lunarToSolar(event, year);
    if (date && date >= first && date <= last)
      results.push(occurrenceFromDate(event, date, first));
  }
  return results.sort(
    (a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime(),
  );
}

export function formatCountdownEventDate(
  event: CountdownEventRecord,
  occurrence?: CountdownOccurrence,
): string {
  return occurrence?.occurrenceDateLabel ?? originalDateLabel(event);
}

export function createCountdownDayBoundaryWatcher(
  callback: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastDate = formatLocalDate(new Date());
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const now = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1,
    );
    timer = setTimeout(
      () => {
        lastDate = formatLocalDate(new Date());
        callback();
        schedule();
      },
      Math.max(1000, next.getTime() - now.getTime()),
    );
  };
  const visible = () => {
    if (document.visibilityState !== "visible") return;
    const current = formatLocalDate(new Date());
    if (current !== lastDate) {
      lastDate = current;
      callback();
    }
    schedule();
  };
  document.addEventListener("visibilitychange", visible);
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", visible);
  };
}
