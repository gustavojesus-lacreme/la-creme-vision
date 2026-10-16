import { describe, it, expect } from "bun:test";
import { extraServicePrice } from "./booking";
const combos = [
  { id: "1", name: "C+S", service_ids: ["corte", "sobr"], price_cents: 4000, duration_minutes: 0, item_prices: { corte: 3500, sobr: 500 } },
  { id: "2", name: "C+B", service_ids: ["corte", "big"], price_cents: 4000, duration_minutes: 0, item_prices: { corte: 3500, big: 500 } },
];
describe("serviço adicional na finalização", () => {
  it("sobrancelha adicionada a um corte custa R$ 5", () => {
    expect(extraServicePrice({ id: "sobr", price_cents: 1500 }, ["corte"], combos)).toBe(500);
  });
  it("bigode adicionado a um corte custa R$ 5", () => {
    expect(extraServicePrice({ id: "big", price_cents: 1500 }, ["corte"], combos)).toBe(500);
  });
  it("sem corte no atendimento, sobrancelha custa preço cheio", () => {
    expect(extraServicePrice({ id: "sobr", price_cents: 1500 }, ["outro"], combos)).toBe(1500);
  });
});
