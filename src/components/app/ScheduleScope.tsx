import { useQuery } from "@tanstack/react-query";
import { Store, Users, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { barberFullName, type ScheduleScope as Scope } from "@/lib/schedule";
import { sInput, sLabel } from "./SettingsShell";

export function ScheduleScope({ scope, barberId, onChange, disabled = false }: {
  scope: Scope; barberId: string; onChange: (scope: Scope, id: string) => void; disabled?: boolean;
}) {
  const q = useQuery({ queryKey: ["schedule-barbers"], queryFn: async () => {
    const { data, error } = await supabase.from("barbers").select("id, name, last_name").is("archived_at", null).order("sort_order");
    if (error) throw error;
    return data ?? [];
  } });
  const selected = q.data?.find((b) => b.id === barberId);
  return <section className="space-y-3 border-b border-border pb-4">
    <h2 className="text-sm font-bold text-foreground">Aplicar a</h2>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Aplicar a">
      {([{ value: "shop", label: "Barbearia inteira", icon: Store }, { value: "team", label: "Todos os barbeiros", icon: Users }, { value: "barber", label: "Um barbeiro", icon: UserRound }] as const).map((x) =>
        <Button key={x.value} variant={scope === x.value ? "secondary" : "outline"} disabled={disabled} aria-pressed={scope === x.value} onClick={() => onChange(x.value, barberId)} className={`h-auto min-h-12 whitespace-normal ${scope === x.value ? "border border-brand text-brand" : ""}`}><x.icon />{x.label}</Button>)}
    </div>
    {scope === "barber" && <label className={sLabel}><span>Barbeiro selecionado</span><select disabled={disabled} className={sInput} value={barberId} onChange={(e) => onChange(scope, e.target.value)}><option value="">Selecione o barbeiro</option>{q.data?.map((b) => <option key={b.id} value={b.id}>{barberFullName(b.name, b.last_name)}</option>)}</select></label>}
    <p className="text-sm font-semibold text-brand">{scope === "shop" ? "Barbearia inteira · padrão geral" : scope === "team" ? "Todos os barbeiros · aplicação em conjunto" : selected ? barberFullName(selected.name, selected.last_name) : "Nenhum barbeiro selecionado"}</p>
  </section>;
}