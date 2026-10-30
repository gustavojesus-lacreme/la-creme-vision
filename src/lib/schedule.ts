export type ScheduleScope = "shop" | "team" | "barber";
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export function barberFullName(name: string, last = "") {
  return last && !name.trim().toLocaleLowerCase().endsWith(last.trim().toLocaleLowerCase()) ? `${name.trim()} ${last.trim()}` : name.trim();
}
export function absenceDates(start: string, end: string, weekdays: number[] | null): string[] {
  if (!start || !end || end < start) return [];
  const result: string[] = [];
  const date = new Date(`${start}T12:00:00Z`);
  for (let i = 0; i <= 366; i++) {
    const day = date.toISOString().slice(0, 10);
    if (day > end) break;
    if (!weekdays || weekdays.includes(date.getUTCDay())) result.push(day);
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return result;
}