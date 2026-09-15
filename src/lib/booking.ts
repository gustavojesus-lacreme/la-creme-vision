export const SLOT_STEP_MINUTES = 30;

export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function weekdayOf(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
}

function atTime(dateStr: string, time: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateLong(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export type BusyInterval = { starts_at: string; ends_at: string };

export function buildAvailableSlots(options: {
  dateStr: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  busy: BusyInterval[];
}): Date[] {
  const { dateStr, opensAt, closesAt, durationMinutes, busy } = options;
  const open = atTime(dateStr, opensAt);
  const close = atTime(dateStr, closesAt);
  const now = new Date();

  const busyRanges = busy.map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));

  const slots: Date[] = [];
  for (
    let cursor = new Date(open);
    cursor.getTime() + durationMinutes * 60000 <= close.getTime();
    cursor = new Date(cursor.getTime() + SLOT_STEP_MINUTES * 60000)
  ) {
    const start = cursor.getTime();
    const end = start + durationMinutes * 60000;
    if (start <= now.getTime()) continue;
    const overlaps = busyRanges.some((b) => start < b.end && end > b.start);
    if (overlaps) continue;
    slots.push(new Date(start));
  }
  return slots;
}
