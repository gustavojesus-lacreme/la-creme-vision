export function cashChange(totalCents: number, receivedCents: number | null, enabled?: boolean) {
  if (enabled === false) return { changeCents: 0, error: null };
  if (enabled === true && receivedCents === null) return { changeCents: 0, error: "Informe o dinheiro recebido para calcular o troco." };
  if (receivedCents === null) return { changeCents: 0, error: null };
  if (!Number.isSafeInteger(receivedCents) || receivedCents < 0) return { changeCents: 0, error: "Informe um valor recebido válido." };
  if (receivedCents < totalCents) return { changeCents: 0, error: "O valor recebido deve cobrir o total do atendimento." };
  return { changeCents: receivedCents - totalCents, error: null };
}