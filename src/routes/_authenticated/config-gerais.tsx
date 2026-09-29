import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell, sBtn, sCard, sInput, sLabel } from "@/components/app/SettingsShell";

export const Route = createFileRoute("/_authenticated/config-gerais")({
  head: () => ({
    meta: [
      { title: "Configurações gerais | LA CREME BARBER" },
      { name: "description", content: "Dados da barbearia e preferências do sistema." },
      { property: "og:title", content: "Configurações gerais | LA CREME BARBER" },
      { property: "og:description", content: "Dados públicos da barbearia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GeneralPage,
});

const FIELDS = [
  ["shop_name", "Nome da barbearia", "text"],
  ["shop_whatsapp", "WhatsApp", "tel"],
  ["shop_email", "E-mail", "email"],
  ["shop_address", "Endereço", "text"],
] as const;
type Key = (typeof FIELDS)[number][0] | "shop_public_info";

function GeneralPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["general-settings"],
    queryFn: async () =>
      (await supabase.from("operation_settings").select("shop_name, shop_whatsapp, shop_email, shop_address, shop_public_info").eq("id", 1).maybeSingle()).data,
  });
  const [f, setF] = useState<Record<Key, string> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);

  async function save() {
    if (!f) return;
    if (!f.shop_name.trim()) return setMsg("Informe o nome da barbearia.");
    const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) as Record<Key, string>;
    const { error } = await supabase.from("operation_settings").update(payload).eq("id", 1);
    setMsg(error ? "Não foi possível salvar." : "Dados salvos.");
    qc.invalidateQueries({ queryKey: ["general-settings"] });
    qc.invalidateQueries({ queryKey: ["public-settings"] });
  }

  return (
    <SettingsShell title="Configurações gerais">
      {f && (
        <section className={`${sCard} space-y-3`}>
          <h2 className="text-base font-bold uppercase tracking-wide text-brand">Dados da barbearia</h2>
          {FIELDS.map(([k, l, t]) => (
            <label key={k} className={sLabel}>
              <span>{l}</span>
              <input type={t} className={sInput} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </label>
          ))}
          <label className={sLabel}>
            <span>Informações públicas (aparecem no rodapé do agendamento)</span>
            <textarea className={`${sInput} min-h-20 py-2`} value={f.shop_public_info} onChange={(e) => setF({ ...f, shop_public_info: e.target.value })} />
          </label>
          <p className="text-xs text-foreground/60">WhatsApp, e-mail, endereço e informações públicas preenchidos aparecem para o cliente na tela de agendamento.</p>
          {msg && <p className="text-sm font-semibold text-foreground">{msg}</p>}
          <button type="button" onClick={save} className={`${sBtn} w-full`}>Salvar</button>
        </section>
      )}
      <section className={`${sCard} space-y-2`}>
        <h2 className="text-base font-bold uppercase tracking-wide text-brand">Sistema</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-foreground/60">Moeda</dt><dd className="font-semibold text-foreground">Real (R$)</dd>
          <dt className="text-foreground/60">Fuso horário</dt><dd className="font-semibold text-foreground">Brasília (São Paulo)</dd>
          <dt className="text-foreground/60">Formato de data</dt><dd className="font-semibold text-foreground">dd/mm/aaaa</dd>
        </dl>
        <p className="text-xs text-foreground/60">Padrões fixos da operação no Brasil.</p>
      </section>
    </SettingsShell>
  );
}
