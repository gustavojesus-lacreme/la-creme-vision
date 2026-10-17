export type ConfirmationDetails = {
  name?: string | null;
  startsAt: string;
  services?: string | null;
  barber?: string | null;
};

const validDdds = new Set("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "));

/** Notification-only normalization; does not change registration/booking rules. */
export function confirmationPhone(value: string | null | undefined): string | null {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length !== 11 || !validDdds.has(digits.slice(0, 2)) || digits[2] !== "9") return null;
  const tail = digits.slice(3);
  if (/(\d)\1{4,}/.test(tail) || tail === "12345678" || tail === "87654321") return null;
  return `55${digits}`;
}

export function confirmationMessage(details: ConfirmationDetails): string {
  const date = new Date(details.startsAt);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_appointment_date");
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  const lines = [`📅 Data: ${day}`, `⏰ Horário: ${time}`];
  if (details.services?.trim()) lines.push(`✂️ Serviço: ${details.services.trim()}`);
  if (details.barber?.trim()) lines.push(`💈 Barbeiro: ${details.barber.trim()}`);
  return `Olá${details.name?.trim() ? `, ${details.name.trim()}` : ""}! Tudo certo? 💈✂️\n\nSeu agendamento na LA CREME BARBER foi confirmado!\n\n${lines.join("\n")}\n\nEstamos te esperando!\n\nAgradecemos pela preferência.\nLA CREME BARBER`;
}