import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { weekdayOf } from "@/lib/booking";
import { ABSENCE_KINDS, todaySP, type AbsenceKind } from "@/lib/absences";

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
};
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const spMinutes = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  return toMin(p);
};

type Cell = { kind: "livre" } | { kind: "cliente"; name: string } | { kind: "almoco" } | { kind: "bloqueio"; label: string };

/** Agenda do dia do barbeiro em intervalos de 30 min: agendado, disponível, almoço, bloqueio/ausência. */
export function BarberDayGrid({ barberId }: { barberId: string }) {
  const [day, setDay] = useState(todaySP());

  const q = useQuery({
    queryKey: ["barber-day", barberId, day],
    queryFn: async () => {
      const start = new Date(`${day}T00:00:00-03:00`).toISOString();
      const end = new Date(new Date(`${day}T00:00:00-03:00`).getTime() + 86400000).toISOString();
      const [hours, appts, abs, settings] = await Promise.all([
        supabase.from("business_hours").select("opens_at, closes_at, closed").eq("weekday", weekdayOf(day)).maybeSingle(),
        supabase.from("appointments").select("starts_at, ends_at, customer_first_name, status").eq("barber_id", barberId)
          .neq("status", "cancelado").gte("starts_at", start).lt("starts_at", end),
        supabase.from("barber_absences").select("kind, starts_time, ends_time").eq("barber_id", barberId).lte("starts_on", day).gte("ends_on", day),
        supabase.from("operation_settings").select("lunch_start, lunch_end").eq("id", 1).maybeSingle(),
      ]);
      return { hours: hours.data, appts: appts.data ?? [], abs: abs.data ?? [], settings: settings.data };
    },
  });

  const d = q.data;
  let rows: Array<{ t: number; cell: Cell }> = [];
  let closed = false;
  if (d) {
    if (!d.hours || d.hours.closed || !d.hours.opens_at || !d.hours.closes_at) closed = true;
    else {
      const ownLunch = d.abs.some((a) => a.kind === "almoco");
      for (let t = toMin(d.hours.opens_at); t < toMin(d.hours.closes_at); t += 30) {
        const e = t + 30;
        const ap = d.appts.find((a) => spMinutes(a.starts_at) < e && spMinutes(a.ends_at) > t);
        const ab = d.abs.find((a) => !a.starts_time || (toMin(a.starts_time) < e && toMin(a.ends_time!) > t));
        const dl = !ownLunch && d.settings?.lunch_start && toMin(d.settings.lunch_start) < e && toMin(d.settings.lunch_end!) > t;
        const cell: Cell = ap
          ? { kind: "cliente", name: ap.customer_first_name }
          : ab
            ? ab.kind === "almoco"
              ? { kind: "almoco" }
              : { kind: "bloqueio", label: ABSENCE_KINDS[ab.kind as AbsenceKind] ?? "Bloqueado" }
            : dl
              ? { kind: "almoco" }
              : { kind: "livre" };
        rows.push({ t, cell });
      }
    }
  }

  const style: Record<Cell["kind"], string> = {
    livre: "border-brand/30 bg-brand/5 text-brand",
    cliente: "border-border bg-card text-card-foreground",
    almoco: "border-gold/50 bg-gold/10 text-foreground",
    bloqueio: "border-destructive/40 bg-destructive/5 text-foreground",
  };
  const text = (c: Cell) =>
    c.kind === "livre" ? "Disponível" : c.kind === "cliente" ? c.name : c.kind === "almoco" ? "Almoço" : c.label;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-card-foreground">Agenda do dia</h2>
        <Link to="/ausencias" className="min-h-11 rounded-md border border-brand px-3 py-2 text-sm font-bold text-brand">+ Bloquear agenda</Link>
      </div>
      <input type="date" value={day} onChange={(e) => setDay(e.target.value || todaySP())}
        className="mt-3 min-h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground" />
      {q.isLoading && <p className="mt-3 text-sm text-foreground/70">Carregando...</p>}
      {closed && <p className="mt-3 text-sm text-foreground/70">Barbearia fechada neste dia.</p>}
      <div className="mt-3 grid gap-1">
        {rows.map(({ t, cell }) => (
          <div key={t} className={`flex min-h-10 items-center gap-3 rounded-md border px-3 text-sm ${style[cell.kind]}`}>
            <span className="w-12 shrink-0 font-bold tabular-nums">{fmt(t)}</span>
            <span className={`min-w-0 truncate ${cell.kind === "cliente" ? "" : "text-xs font-bold uppercase tracking-wide"}`}>{text(cell)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
