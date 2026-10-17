import { describe, expect, it } from "vitest";
import { confirmationMessage, confirmationPhone } from "./whatsapp-confirmation";

describe("regras da confirmação WhatsApp", () => {
  it("normaliza número brasileiro para E.164 apenas com dígitos", () => {
    expect(confirmationPhone("(11) 98765-4320")).toBe("5511987654320");
    expect(confirmationPhone("+55 11 98765-4320")).toBe("5511987654320");
  });
  it("rejeita DDD inexistente e números fictícios", () => {
    expect(confirmationPhone("20987654320")).toBeNull();
    expect(confirmationPhone("11999999999")).toBeNull();
    expect(confirmationPhone(null)).toBeNull();
  });
  it("usa data e hora de Brasília, inclusive na virada do dia UTC", () => {
    const message = confirmationMessage({ startsAt: "2026-10-18T01:30:00Z" });
    expect(message).toContain("📅 Data: 17/10/2026");
    expect(message).toContain("⏰ Horário: 22:30");
  });
  it("não inventa serviço ou barbeiro quando ausentes", () => {
    const message = confirmationMessage({ startsAt: "2026-10-18T01:30:00Z" });
    expect(message.includes("Serviço:")).toBe(false);
    expect(message.includes("Barbeiro:")).toBe(false);
  });
});