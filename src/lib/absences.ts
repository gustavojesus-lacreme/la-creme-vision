export const ABSENCE_KINDS = {
  ferias: "Férias",
  atestado: "Atestado médico",
  saude: "Ausência por motivo de saúde",
  emergencia: "Emergência",
  ausente: "Ausente",
} as const;

export type AbsenceKind = keyof typeof ABSENCE_KINDS;

export type Absence = {
  id: string;
  barber_id: string;
  kind: AbsenceKind;
  starts_on: string;
  ends_on: string;
  note: string;
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

/** Ausência ativa hoje (se houver). */
export function activeAbsence<T extends { barber_id: string; starts_on: string; ends_on: string }>(
  list: T[] | undefined,
  barberId: string,
  day = todaySP(),
): T | undefined {
  return list?.find((a) => a.barber_id === barberId && a.starts_on <= day && a.ends_on >= day);
}
