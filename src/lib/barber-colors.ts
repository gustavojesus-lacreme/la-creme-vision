/**
 * Cor automática de cada barbeiro, pela ordem de cadastro.
 * As 8 primeiras vêm da paleta da marca (tokens --barber-N); depois disso a cor
 * é gerada pelo ângulo áureo, com mesma luminosidade/saturação, para nunca repetir.
 * Se o administrador tiver escolhido uma cor no cadastro, ela é respeitada.
 */
export function barberColor(index: number, custom?: string | null): string {
  if (custom && custom.trim()) return custom;
  if (index >= 0 && index < 8) return `var(--barber-${index + 1})`;
  const hue = Math.round((205 + index * 137.508) % 360);
  return `oklch(0.55 0.085 ${hue})`;
}

export function buildBarberColors(barbers: { id: string; color?: string | null }[]): Map<string, string> {
  return new Map(barbers.map((b, i) => [b.id, barberColor(i, b.color)]));
}

/** Fundo suave com a cor do barbeiro. */
export const tint = (c: string, pct = 9) => `color-mix(in oklab, ${c} ${pct}%, var(--card))`;
