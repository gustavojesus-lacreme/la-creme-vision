import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarberShell } from "@/components/app/BarberShell";
import { sCard, sBtn, sInput } from "@/components/app/SettingsShell";
import { EncaixeDialog } from "@/components/app/EncaixeDialog";

export const Route = createFileRoute("/_authenticated/meus-clientes")({
  head: () => ({
    meta: [
      { title: "Meus clientes | LA CREME BARBER" },
      { name: "description", content: "Clientes atendidos pelo barbeiro e histórico de atendimentos." },
      { property: "og:title", content: "Meus clientes | LA CREME BARBER" },
      { property: "og:description", content: "Histórico dos clientes atendidos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <BarberShell title="Clientes">{(id) => <Clients barberId={id} />}</BarberShell>,
});

type H = { starts_at: string; status: string; services: string; products: string[] };
const ST: Record<string, string> = { agendado: "Agendado", finalizado: "Finalizado", nao_compareceu: "Não compareceu" };
const dt = (s: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(s));

function Clients({ barberId }: { barberId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [term, setTerm] = useState("");
  const [novo, setNovo] = useState(false);
  const q = useQuery({ queryKey: ["my-clients"], queryFn: async () => (await supabase.rpc("get_my_clients")).data ?? [] });
  const list = (q.data ?? []).filter((c) => c.client_name.toLowerCase().includes(term.toLowerCase()));
  return (
    <div className="space-y-3">
      <button type="button" className={`${sBtn} w-full`} onClick={() => setNovo(true)}>+ Cadastrar cliente e agendar</button>
      <input className={sInput} placeholder="Buscar pelo nome" value={term} onChange={(e) => setTerm(e.target.value)} />
      {q.isLoading && <p>Carregando...</p>}
      {q.data?.length === 0 && <div className={sCard}>Você ainda não tem clientes atendidos.</div>}
      {list.map((c, i) => (
        <div key={i} className={sCard}>
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(open === i ? null : i)}>
            <span><span className="block font-bold">{c.client_name}</span>
              <span className="text-sm text-foreground/60">{c.visits} atendimento(s) · último em {dt(c.last_visit)}</span></span>
            <span className="text-sm text-brand">{open === i ? "Fechar" : "Histórico"}</span>
          </button>
          {open === i && (
            <ul className="mt-3 space-y-2 border-t border-border pt-3">
              {(c.history as H[]).map((h, k) => (
                <li key={k} className="text-sm">
                  <span className="font-semibold">{dt(h.starts_at)}</span> · {ST[h.status] ?? h.status}
                  <span className="block text-foreground/80">{h.services}</span>
                  {h.products.length > 0 && <span className="block text-foreground/60">Produtos: {h.products.join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {novo && <EncaixeDialog barberId={barberId} onClose={() => setNovo(false)} onDone={() => { setNovo(false); qc.invalidateQueries({ queryKey: ["my-clients"] }); }} />}
    </div>
  );
}
