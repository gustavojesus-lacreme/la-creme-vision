import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarberShell } from "@/components/app/BarberShell";
import { sCard } from "@/components/app/SettingsShell";
import { formatDuration, formatPrice } from "@/lib/booking";

export const Route = createFileRoute("/_authenticated/meus-servicos")({
  head: () => ({
    meta: [
      { title: "Meus serviços | LA CREME BARBER" },
      { name: "description", content: "Serviços que o barbeiro realiza, com preço e duração." },
      { property: "og:title", content: "Meus serviços | LA CREME BARBER" },
      { property: "og:description", content: "Serviços, preços e duração." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <BarberShell title="Serviços">{(id) => <List barberId={id} />}</BarberShell>,
});

function List({ barberId }: { barberId: string }) {
  const q = useQuery({
    queryKey: ["my-services", barberId],
    queryFn: async () => {
      const [b, s] = await Promise.all([
        supabase.from("barbers").select("service_ids").eq("id", barberId).maybeSingle(),
        supabase.from("services").select("id, name, price_cents, duration_minutes").eq("active", true).order("sort_order"),
      ]);
      return (s.data ?? []).filter((x) => (b.data?.service_ids ?? []).includes(x.id));
    },
  });
  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground/70">Somente consulta. Preços e durações são definidos pela administração.</p>
      {q.data?.length === 0 && <div className={sCard}>Nenhum serviço liberado para você.</div>}
      {q.data?.map((s) => (
        <div key={s.id} className={`${sCard} flex items-center justify-between gap-3`}>
          <span className="font-semibold">{s.name}</span>
          <span className="text-right text-sm text-foreground/80">{formatPrice(s.price_cents)} · {formatDuration(s.duration_minutes)}</span>
        </div>
      ))}
    </div>
  );
}
