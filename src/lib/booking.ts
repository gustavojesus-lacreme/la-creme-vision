export const SLOT_STEP_MINUTES = 30;

export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export type PricedService = { id: string; name: string; price_cents: number; duration_minutes: number };
export type ServiceCombo = { id: string; name: string; service_ids: string[]; price_cents: number; duration_minutes: number };

/** Combos first (largest first, no overlapping services), then remaining services individually. */
export function calculateTotals(selected: PricedService[], combos: ServiceCombo[]) {
  const remaining = new Set(selected.map((s) => s.id));
  // Regra do Pezinho: incluído no Corte (sem preço nem duração extra).
  const norm = (n: string) => n.trim().toLowerCase();
  const hasCorte = selected.some((s) => norm(s.name) === "corte");
  const pezinho = selected.find((s) => norm(s.name) === "pezinho");
  if (hasCorte && pezinho) remaining.delete(pezinho.id);
  const applied: ServiceCombo[] = [];
  const sorted = [...combos]
    .filter((c) => c.service_ids.length > 0)
    .sort((a, b) => b.service_ids.length - a.service_ids.length);
  for (const combo of sorted) {
    const ids = combo.service_ids.filter((id) => id !== pezinho?.id || !hasCorte);
    if (ids.length > 0 && ids.length < combo.service_ids.length && ids.length === 1) continue;
    if (combo.service_ids.every((id) => remaining.has(id))) {
      applied.push(combo);
      combo.service_ids.forEach((id) => remaining.delete(id));
    }
  }
  const extras = selected.filter((s) => remaining.has(s.id));
  const priceCents =
    applied.reduce((t, c) => t + c.price_cents, 0) + extras.reduce((t, s) => t + s.price_cents, 0);
  const durationMinutes =
    applied.reduce((t, c) => t + c.duration_minutes, 0) +
    extras.reduce((t, s) => t + s.duration_minutes, 0);
  return { priceCents, durationMinutes, applied, extras };
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}
