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

const normName = (n: string) => n.trim().toLowerCase();
/** Serviço bloqueado -> serviço que o bloqueia (Corte inclui Pezinho; Barba inclui Bigode). */
const BLOCKED_BY: Record<string, string> = { pezinho: "corte", bigode: "barba" };

/** Retorna true se o serviço deve ficar inativo dada a seleção atual. */
export function isServiceBlocked(service: { name: string }, selected: { name: string }[]) {
  const blocker = BLOCKED_BY[normName(service.name)];
  return !!blocker && selected.some((s) => normName(s.name) === blocker);
}

/** Exact combo first; otherwise largest contained combos (no overlap), then remaining services individually. */
export function calculateTotals(selected: PricedService[], combos: ServiceCombo[]) {
  const effective = selected.filter((s) => !isServiceBlocked(s, selected));
  const remaining = new Set(effective.map((s) => s.id));
  const applied: ServiceCombo[] = [];
  const valid = combos.filter((c) => c.service_ids.length > 0);
  const exact = valid.find(
    (c) => c.service_ids.length === remaining.size && c.service_ids.every((id) => remaining.has(id)),
  );
  const sorted = exact
    ? [exact]
    : [...valid].sort((a, b) => b.service_ids.length - a.service_ids.length);
  for (const combo of sorted) {
    if (combo.service_ids.every((id) => remaining.has(id))) {
      applied.push(combo);
      combo.service_ids.forEach((id) => remaining.delete(id));
    }
  }
  const extras = effective.filter((s) => remaining.has(s.id));
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

/** "Corte, Barba e Luzes" a partir dos serviços habilitados do barbeiro. */
export function formatBarberServices(serviceIds: string[], services: { id: string; name: string }[] | undefined) {
  const names = serviceIds.map((id) => services?.find((s) => s.id === id)?.name).filter(Boolean) as string[];
  if (!names.length) return "Nenhum serviço definido";
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
