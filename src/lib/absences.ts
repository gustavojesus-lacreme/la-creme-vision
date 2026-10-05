/** Conceito único: Ausente. O "kind" guarda o motivo opcional. */
export const ABSENCE_KINDS = {
  ausente: "Ausente",
  ferias: "Ausente · Férias",
  atestado: "Ausente · Afastamento médico",
  emergencia: "Ausente · Emergência",
  almoco: "Almoço (registro antigo)",
} as const;

/** Motivos selecionáveis (Férias só para a administração). */
export const ABSENCE_REASONS: { kind: AbsenceKind; label: string; adminOnly?: boolean }[] = [
  { kind: "ausente", label: "Sem motivo" },
  { kind: "emergencia", label: "Emergência" },
  { kind: "atestado", label: "Afastamento médico" },
  { kind: "ferias", label: "Férias", adminOnly: true },
];

/** Rótulo de status interno (admin) para ausência de dia inteiro. */
export function statusLabel(kind: AbsenceKind): string {
  return kind === "ferias" ? "Em férias" : "Ausente";
}

export type AbsenceKind = keyof typeof ABSENCE_KINDS;

export type Absence = {
  id: string;
  barber_id: string;
  kind: AbsenceKind;
  starts_on: string;
  ends_on: string;
  note: string;
  starts_time?: string | null;
};

export function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function formatDay(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function formatDayShort(d: string): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function returnDay(ends_on: string): string {
  const dt = new Date(`${ends_on}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Ausência de dia inteiro ativa no dia (se houver). */
export function activeAbsence<T extends { barber_id: string; starts_on: string; ends_on: string; starts_time?: string | null }>(
  list: T[] | undefined,
  barberId: string,
  day = todaySP(),
): T | undefined {
  return list?.find((a) => !a.starts_time && a.barber_id === barberId && a.starts_on <= day && a.ends_on >= day);
}
