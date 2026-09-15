import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({
    meta: [
      { title: "Minha conta | LA CREME BARBER" },
      { name: "description", content: "Atualize seu nome e WhatsApp na LA CREME BARBER." },
      { property: "og:title", content: "Minha conta | LA CREME BARBER" },
      { property: "og:description", content: "Atualize seus dados de contato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyAccount,
});

const inputClass =
  "min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";

function MyAccount() {
  const { session } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, whatsapp")
        .eq("id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setFirstName(profile.first_name);
    setLastName(profile.last_name);
    setWhatsapp(profile.whatsapp);
  }, [profileQuery.data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setSaved(false);
    await supabase.from("profiles").upsert({
      id: session.user.id,
      first_name: firstName,
      last_name: lastName,
      whatsapp,
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Minha conta</h1>
        <p className="text-base text-foreground/70">{session?.user.email}</p>

        <form className="space-y-3" onSubmit={save}>
          <input
            className={inputClass}
            placeholder="Nome"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Sobrenome"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="WhatsApp"
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
          {saved && <p className="text-sm font-semibold text-brand">Dados salvos.</p>}
          <button
            type="submit"
            disabled={saving}
            className="min-h-13 w-full rounded-md bg-brand px-6 text-base font-bold text-brand-foreground disabled:opacity-60"
          >
            Salvar
          </button>
        </form>
      </main>
    </div>
  );
}
