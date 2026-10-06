import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarberShell } from "@/components/app/BarberShell";
import { sCard } from "@/components/app/SettingsShell";
import { formatPrice } from "@/lib/booking";

export const Route = createFileRoute("/_authenticated/meus-produtos")({
  head: () => ({
    meta: [
      { title: "Produtos | LA CREME BARBER" },
      { name: "description", content: "Produtos disponíveis para venda e quantidade em estoque." },
      { property: "og:title", content: "Produtos | LA CREME BARBER" },
      { property: "og:description", content: "Produtos à venda e estoque disponível." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <BarberShell title="Produtos">{() => <List />}</BarberShell>,
});

function List() {
  const q = useQuery({ queryKey: ["sellable-products"], queryFn: async () => (await supabase.rpc("get_sellable_products")).data ?? [] });
  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground/70">Somente consulta. A venda é registrada ao finalizar o atendimento no Painel.</p>
      {q.data?.length === 0 && <div className={sCard}>Nenhum produto disponível.</div>}
      {q.data?.map((p) => (
        <div key={p.id} className={`${sCard} flex items-center justify-between gap-3`}>
          <span className="min-w-0"><span className="block font-semibold">{p.name}</span><span className="text-sm text-foreground/60">{p.category}</span></span>
          <span className="text-right text-sm"><span className="block font-semibold">{formatPrice(p.price_cents)}</span>
            <span className={p.low ? "text-destructive" : "text-foreground/70"}>{p.stock} em estoque</span></span>
        </div>
      ))}
    </div>
  );
}
