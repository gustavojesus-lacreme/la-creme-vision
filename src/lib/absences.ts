export const ABSENCE_KINDS = {
  ferias: "Férias",
  atestado: "Atestado médico",
  saude: "Ausência por motivo de saúde",
  emergencia: "Emergência",
  ausente: "Ausente",
  almoco: "Almoço",
  pausa: "Pausa/intervalo",
  indisponivel: "Indisponibilidade temporária",
} as const;

/** Tipos operacionais: por padrão são de horário parcial. */
export const PARTIAL_KINDS: AbsenceKind[] = ["almoco", "pausa", "indisponivel"];

/** Rótulo de status interno (admin) para ausência de dia inteiro. */
export function statusLabel(kind: AbsenceKind): string {
  if (kind === "ferias") return "Em férias";
  if (kind === "ausente") return "Ausente";
  return "Indisponível";
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
