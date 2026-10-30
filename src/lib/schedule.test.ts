import { describe, expect, it } from "vitest";
import { absenceDates } from "./schedule";
describe("ausências", () => {
  it("aplica somente um dia quando início e fim coincidem", () => {
    expect(absenceDates("2026-11-02", "2026-11-02", null)).toEqual(["2026-11-02"]);
  });
  it("repete somente nos dias da semana selecionados até a data final", () => {
    expect(absenceDates("2026-11-02", "2026-11-16", [1, 3])).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11", "2026-11-16"]);
  });
});