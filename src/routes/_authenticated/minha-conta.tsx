import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LogOut } from "lucide-react";
import { getPanelAccess } from "@/lib/admin";
import { clearGuest } from "@/lib/guest";
import { sCard, sBtn, sBtnOutline, sInput, sLabel } from "@/components/app/SettingsShell";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app/AppNav";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({
    meta: [
      { title: "Minha conta | LA CREME BARBER" },
      { name: "description", content: "Dados pessoais, e-mail, senha e segurança da sua conta." },
      { property: "og:title", content: "Minha conta | LA CREME BARBER" },
      { property: "og:description", content: "Atualize seus dados de contato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyAccount,
});

function MyAccount() {
  const { session } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const access = useQuery({ queryKey: ["panel-access-page"], queryFn: getPanelAccess });
  useEffect(() => {
    if (access.data?.role === "barbeiro") navigate({ to: "/meu-perfil", replace: true });
  }, [access.data, navigate]);

  const [f, setF] = useState({ first: "", last: "", whatsapp: "", email: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("first_name, last_name, whatsapp").eq("id", session!.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const p = profileQuery.data;
    setF({ first: p?.first_name ?? "", last: p?.last_name ?? "", whatsapp: p?.whatsapp ?? "", email: session?.user.email ?? "" });
  }, [reload, profileQuery.data, session?.user.email]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("profiles").upsert({ id: session.user.id, first_name: f.first.trim(), last_name: f.last.trim(), whatsapp: f.whatsapp.trim() });
    if (error) { setSaving(false); return setMsg(`Não foi possível salvar: ${error.message}`); }
    let note = "Dados salvos.";
    if (f.email.trim() && f.email.trim() !== session.user.email) {
      const r = await supabase.auth.updateUser({ email: f.email.trim() });
      note = r.error ? `Dados salvos, mas o e-mail não foi alterado: ${r.error.message}` : "Dados salvos. Confirme o novo e-mail pelo link enviado.";
    }
    setSaving(false); setMsg(note);
    qc.invalidateQueries({ queryKey: ["profile"] });
  }
  async function changePw() {
    setPwMsg(null);
    if (pw.length < 6) return setPwMsg("A senha precisa ter pelo menos 6 caracteres.");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwMsg(error ? error.message : "Senha alterada."); if (!error) setPw("");
  }
  async function recover() {
    const { error } = await supabase.auth.resetPasswordForEmail(session?.user.email ?? "", { redirectTo: `${window.location.origin}/auth` });
    setPwMsg(error ? error.message : "Enviamos um link de recuperação para seu e-mail.");
  }
  async function signOut() {
    await qc.cancelQueries(); qc.clear(); clearGuest();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const initial = (f.first || session?.user.email || "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <Link to="/configuracoes" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-foreground/70 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Configurações
        </Link>
        <h1 className="font-display text-2xl font-bold text-foreground">Minha conta</h1>

        <form onSubmit={save} className={`${sCard} space-y-3`}>
          <h2 className="text-base font-bold uppercase tracking-wide text-brand">Dados pessoais</h2>
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-brand font-display text-2xl text-brand-foreground">{initial}</span>
            <p className="text-sm text-foreground/65">Seu avatar usa a inicial do seu nome.</p>
          </div>
          <label className={sLabel}><span>Nome</span><input disabled={!editing} className={`${sInput} disabled:bg-secondary/50 disabled:text-foreground/80`} value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} /></label>
          <label className={sLabel}><span>Sobrenome</span><input disabled={!editing} className={`${sInput} disabled:bg-secondary/50 disabled:text-foreground/80`} value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} /></label>
          <label className={sLabel}><span>WhatsApp</span><input disabled={!editing} className={`${sInput} disabled:bg-secondary/50 disabled:text-foreground/80`} inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></label>
          <label className={sLabel}><span>E-mail</span><input disabled={!editing} className={`${sInput} disabled:bg-secondary/50 disabled:text-foreground/80`} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          {msg && <p className="text-sm font-semibold text-brand" role="status">{msg}</p>}
          <button type="submit" disabled={saving} className={`${sBtn} w-full`}>{saving ? "Salvando..." : "Salvar"}</button>
        </form>

        <section className={`${sCard} space-y-3`}>
          <h2 className="text-base font-bold uppercase tracking-wide text-brand">Segurança</h2>
          <label className={sLabel}><span>Nova senha</span><input className={sInput} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <button type="button" className={`${sBtn} w-full`} onClick={changePw}>Alterar senha</button>
          <button type="button" className={`${sBtnOutline} w-full`} onClick={recover}>Recuperar senha por e-mail</button>
          {pwMsg && <p className="text-sm font-semibold text-brand" role="status">{pwMsg}</p>}
        </section>

        <button type="button" className={`${sBtnOutline} w-full`} onClick={signOut}>
          <LogOut className="mr-2 inline h-4 w-4" /> Sair da conta
        </button>
      </main>
    </div>
  );
}
