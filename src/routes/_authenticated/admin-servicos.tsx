import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/booking";

export const Route = createFileRoute("/_authenticated/admin-servicos")({
  head: () => ({
    meta: [
      { title: "Serviços e combinações | LA CREME BARBER" },
      { name: "description", content: "Gerencie serviços e combinações da LA CREME BARBER." },
      { property: "og:title", content: "Serviços e combinações | LA CREME BARBER" },
      { property: "og:description", content: "Área administrativa de serviços e combinações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminServicesPage,
});

type Service = { id: string; name: string; price_cents: number; duration_minutes: number; active: boolean; sort_order: number };
type Combo = { id: string; name: string; service_ids: string[]; price_cents: number; duration_minutes: number; active: boolean };

const card = "rounded-lg border border-border bg-card p-4";
const input =
  "min-h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";
const btnPrimary =
  "min-h-12 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50";
const btnOutline = "min-h-12 rounded-md border border-input px-4 text-base font-semibold text-foreground";

const toCents = (v: string) => Math.round(parseFloat(v.replace(",", ".")) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function AdminServicesPage() {
  const qc = useQueryClient();
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  const isAdmin = adminQuery.data === true;

  const servicesQuery = useQuery({
    queryKey: ["admin-services"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, price_cents, duration_minutes, active, sort_order")
        .order("sort_order");
      if (error) throw error;
      // Combinações não são serviços: oculta o antigo "Corte + Barba" individual.
      return ((data ?? []) as Service[]).filter((s) => !s.name.includes("+"));
    },
  });

  const combosQuery = useQuery({
    queryKey: ["admin-combos"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_combos")
        .select("id, name, service_ids, price_cents, duration_minutes, active")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Combo[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-services"] });
    qc.invalidateQueries({ queryKey: ["admin-combos"] });
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.invalidateQueries({ queryKey: ["service_combos"] });
  };

  const [editService, setEditService] = useState<Service | "new" | null>(null);
  const [editCombo, setEditCombo] = useState<Combo | "new" | null>(null);

  const services = servicesQuery.data ?? [];
  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? "?";

  async function toggleService(s: Service) {
    await supabase.from("services").update({ active: !s.active }).eq("id", s.id);
    refresh();
  }
  async function toggleCombo(c: Combo) {
    await supabase.from("service_combos").update({ active: !c.active }).eq("id", c.id);
    refresh();
  }

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Serviços e combinações</h1>

        {adminQuery.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {adminQuery.data === false && (
          <div className={`${card} text-center`}>
            <p className="text-base text-foreground/80">Acesso restrito ao dono/administrador.</p>
          </div>
        )}

        {isAdmin && (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold uppercase text-brand">Serviços</h2>
                <button type="button" className={`${btnOutline} flex items-center gap-1`} onClick={() => setEditService("new")}>
                  <Plus className="h-4 w-4" /> Novo serviço
                </button>
              </div>
              {editService === "new" && (
                <ServiceForm
                  nextOrder={services.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1}
                  onDone={() => { setEditService(null); refresh(); }}
                />
              )}
              <div className="grid gap-2">
                {services.map((s) =>
                  editService !== "new" && editService?.id === s.id ? (
                    <ServiceForm key={s.id} service={s} onDone={() => { setEditService(null); refresh(); }} />
                  ) : (
                    <div key={s.id} className={`${card} flex items-center justify-between gap-3 ${s.active ? "" : "opacity-60"}`}>
                      <div>
                        <p className="text-base font-bold text-card-foreground">{s.name}</p>
                        <p className="text-sm text-foreground/70">
                          {formatPrice(s.price_cents)} · {s.duration_minutes} min · {s.active ? "Ativo" : "Inativo"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" className={btnOutline} onClick={() => toggleService(s)}>
                          {s.active ? "Desativar" : "Ativar"}
                        </button>
                        <button type="button" className={btnOutline} onClick={() => setEditService(s)}>Editar</button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold uppercase text-brand">Combinações</h2>
                <button type="button" className={`${btnOutline} flex items-center gap-1`} onClick={() => setEditCombo("new")}>
                  <Plus className="h-4 w-4" /> Nova combinação
                </button>
              </div>
              {editCombo === "new" && (
                <ComboForm services={services} onDone={() => { setEditCombo(null); refresh(); }} />
              )}
              <div className="grid gap-2">
                {(combosQuery.data ?? []).map((c) =>
                  editCombo !== "new" && editCombo?.id === c.id ? (
                    <ComboForm key={c.id} combo={c} services={services} onDone={() => { setEditCombo(null); refresh(); }} />
                  ) : (
                    <div key={c.id} className={`${card} flex items-center justify-between gap-3 ${c.active ? "" : "opacity-60"}`}>
                      <div>
                        <p className="text-base font-bold text-card-foreground">
                          {c.service_ids.map(nameOf).join(" + ")}
                        </p>
                        <p className="text-sm text-foreground/70">
                          {formatPrice(c.price_cents)} · {c.duration_minutes} min · {c.active ? "Ativa" : "Inativa"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" className={btnOutline} onClick={() => toggleCombo(c)}>
                          {c.active ? "Desativar" : "Ativar"}
                        </button>
                        <button type="button" className={btnOutline} onClick={() => setEditCombo(c)}>Editar</button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ServiceForm({ service, nextOrder, onDone }: { service?: Service; nextOrder?: number; onDone: () => void }) {
  const [name, setName] = useState(service?.name ?? "");
  const [price, setPrice] = useState(service ? fromCents(service.price_cents) : "");
  const [duration, setDuration] = useState(service ? String(service.duration_minutes) : "");
  const [active, setActive] = useState(service?.active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const price_cents = toCents(price);
    const duration_minutes = parseInt(duration, 10);
    if (!name.trim() || !Number.isFinite(price_cents) || price_cents < 0 || !(duration_minutes > 0)) {
      setErr("Preencha nome, preço e duração válidos.");
      return;
    }
    setSaving(true);
    const payload = { name: name.trim(), price_cents, duration_minutes, active };
    const { error } = service
      ? await supabase.from("services").update(payload).eq("id", service.id)
      : await supabase.from("services").insert({ ...payload, sort_order: nextOrder ?? 0 });
    setSaving(false);
    if (error) setErr("Não foi possível salvar.");
    else onDone();
  }

  return (
    <div className={`${card} space-y-3 border-brand`}>
      <label className="block space-y-1">
        <span className="text-sm font-semibold text-foreground/70">Nome</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-foreground/70">Preço (R$)</span>
          <input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-foreground/70">Duração (min)</span>
          <input className={input} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
      </div>
      <label className="flex min-h-12 items-center gap-2 text-base text-foreground">
        <input type="checkbox" className="h-5 w-5 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativo
      </label>
      {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className={`${btnPrimary} flex-1`} disabled={saving} onClick={save}>Salvar</button>
        <button type="button" className={btnOutline} onClick={onDone}>Cancelar</button>
      </div>
    </div>
  );
}

function ComboForm({ combo, services, onDone }: { combo?: Combo; services: Service[]; onDone: () => void }) {
  const [ids, setIds] = useState<string[]>(combo?.service_ids ?? []);
  const [price, setPrice] = useState(combo ? fromCents(combo.price_cents) : "");
  const [duration, setDuration] = useState(combo ? String(combo.duration_minutes) : "");
  const [active, setActive] = useState(combo?.active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ordered = services.filter((s) => ids.includes(s.id));
  const autoName = ordered.map((s) => s.name).join(" + ");

  async function save() {
    const price_cents = toCents(price);
    const duration_minutes = parseInt(duration, 10);
    if (ids.length < 2) return setErr("Selecione pelo menos dois serviços.");
    if (!Number.isFinite(price_cents) || price_cents < 0 || !(duration_minutes > 0))
      return setErr("Preencha preço e duração válidos.");
    setSaving(true);
    const payload = { name: autoName, service_ids: ordered.map((s) => s.id), price_cents, duration_minutes, active };
    const { error } = combo
      ? await supabase.from("service_combos").update(payload).eq("id", combo.id)
      : await supabase.from("service_combos").insert(payload);
    setSaving(false);
    if (error) setErr("Não foi possível salvar.");
    else onDone();
  }

  return (
    <div className={`${card} space-y-3 border-brand`}>
      <p className="text-sm font-semibold text-foreground/70">Serviços participantes</p>
      <div className="flex flex-wrap gap-2">
        {services.map((s) => {
          const on = ids.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => setIds((v) => (on ? v.filter((x) => x !== s.id) : [...v, s.id]))}
              className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${
                on ? "border-brand bg-brand text-brand-foreground" : "border-input text-foreground"
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
      <p className="text-base font-bold text-card-foreground">{autoName || "Nome automático"}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-foreground/70">Preço (R$)</span>
          <input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-foreground/70">Duração (min)</span>
          <input className={input} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
      </div>
      <label className="flex min-h-12 items-center gap-2 text-base text-foreground">
        <input type="checkbox" className="h-5 w-5 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativa
      </label>
      {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className={`${btnPrimary} flex-1`} disabled={saving} onClick={save}>Salvar</button>
        <button type="button" className={btnOutline} onClick={onDone}>Cancelar</button>
      </div>
    </div>
  );
}
