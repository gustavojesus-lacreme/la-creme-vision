import { expect, it } from "vitest";
import { chronological } from "./appointment-order";
it("ordena datas e horários dos agendamentos do mais próximo ao mais distante", () => {
  expect(chronological([
    { id: "ultimo", starts_at: "2026-10-24T13:00:00-03:00" },
    { id: "segundo", starts_at: "2026-10-17T19:00:00-03:00" },
    { id: "primeiro", starts_at: "2026-10-17T12:00:00-03:00" },
  ]).map((a) => a.id)).toEqual(["primeiro", "segundo", "ultimo"]);
});