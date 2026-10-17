import { describe, expect, it } from "vitest";
import { cashChange } from "./cash-change";

describe("troco em dinheiro ou Pix", () => {
  it("sem troco mantém o fluxo normal mesmo com valor anterior preenchido", () => {
    expect(cashChange(4500, 10000, false)).toEqual({ changeCents: 0, error: null });
  });
  it("com troco exige informar o dinheiro recebido", () => {
    expect(cashChange(4500, null, true).error).not.toBeNull();
  });
  it("devolve apenas a diferença, mantendo o valor do atendimento", () => {
    expect(cashChange(4500, 10000)).toEqual({ changeCents: 5500, error: null });
  });
  it("não permite finalizar com dinheiro insuficiente", () => {
    expect(cashChange(4500, 4000).error).not.toBeNull();
  });
  it("não exige valor recebido quando o pagamento não usa troco", () => {
    expect(cashChange(4500, null)).toEqual({ changeCents: 0, error: null });
  });
  it("não cria troco quando o valor é exato", () => {
    expect(cashChange(4500, 4500).changeCents).toBe(0);
  });
});