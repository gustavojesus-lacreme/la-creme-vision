import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarberShell } from "@/components/app/BarberShell";
import { sCard, sBtn, sBtnOutline, sInput, sLabel } from "@/components/app/SettingsShell";

export const Route = createFileRoute("/_authenticated/meu-perfil")({
  head: () => ({
    meta: [
      { title: "Minha conta | LA CREME BARBER" },
      { name: "description", content: "Dados pessoais, foto e segurança da conta do barbeiro." },
      { property: "og:title", content: "Minha conta | LA CREME BARBER" },
      { property: "og:description", content: "Dados pessoais e segurança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <BarberShell title="Minha conta" back>{(id) => <Profile barberId={id} />}</BarberShell>,
});

/** Reduz a foto para 256px (JPEG) antes de salvar. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256, c = document.createElement("canvas");
      const s = Math.min(img.width, img.height);
      c.width = c.height = size;
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function Profile({ barberId }: { barberId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["my-barber", barberId],
    queryFn: async () => {
      const [b, u] = await Promise.all([
        supabase.from("barbers").select("name, last_name, whatsapp, photo_url").eq("id", barberId).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      return { ...b.data, email: u.data.user?.email ?? "" };
    },
  });
  const [f, setF] = useState({ name: "", last_name: "", whatsapp: "", photo_url: "" as string | null, email: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  useEffect(() => { if (q.data) setF({ name: q.data.name ?? "", last_name: q.data.last_name ?? "", whatsapp: q.data.whatsapp ?? "", photo_url: q.data.photo_url ?? null, email: q.data.email }); }, [q.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const { error } = await supabase.from("barbers").update({ name: f.name.trim(), last_name: f.last_name.trim(), whatsapp: f.whatsapp.trim(), photo_url: f.photo_url }).eq("id", barberId);
    if (error) return setMsg(error.message);
    await supabase.from("profiles").update({ first_name: f.name.trim(), last_name: f.last_name.trim(), whatsapp: f.whatsapp.trim() }).eq("id", (await supabase.auth.getUser()).data.user!.id);
    let note = "Dados salvos.";
    if (f.email.trim() && f.email.trim() !== q.data?.email) {
      const r = await supabase.auth.updateUser({ email: f.email.trim() });
      note = r.error ? `Dados salvos, mas o e-mail não foi alterado: ${r.error.message}` : "Dados salvos. Confirme o novo e-mail pelo link enviado.";
    }
    setMsg(note);
    qc.invalidateQueries({ queryKey: ["my-barber"] });
  }
  async function changePw() {
    setPwMsg(null);
    if (pw.length < 6) return setPwMsg("A senha precisa ter pelo menos 6 caracteres.");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwMsg(error ? error.message : "Senha alterada."); if (!error) setPw("");
  }
  async function recover() {
    const { error } = await supabase.auth.resetPasswordForEmail(q.data?.email ?? "", { redirectTo: `${window.location.origin}/auth` });
    setPwMsg(error ? error.message : "Enviamos um link de recuperação para seu e-mail.");
  }
  async function signOut() { qc.clear(); await supabase.auth.signOut(); navigate({ to: "/", replace: true }); }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className={`${sCard} space-y-3`}>
        <h2 className="text-base font-bold uppercase tracking-wide text-brand">Dados pessoais</h2>
        <div className="flex items-center gap-3">
          {f.photo_url ? <img src={f.photo_url} alt="Sua foto" className="h-16 w-16 rounded-full object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-sm">Sem foto</span>}
          <label className={`${sBtnOutline} inline-flex cursor-pointer items-center`}>
            Trocar foto
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, photo_url: await shrink(file) }); }} />
          </label>
          {f.photo_url && <button type="button" className="text-sm text-destructive" onClick={() => setF({ ...f, photo_url: null })}>Remover</button>}
        </div>
        <label className={sLabel}><span>Nome</span><input className={sInput} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className={sLabel}><span>Sobrenome</span><input className={sInput} value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></label>
        <label className={sLabel}><span>WhatsApp</span><input className={sInput} inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></label>
        <label className={sLabel}><span>E-mail</span><input className={sInput} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        {msg && <p className="text-sm font-semibold text-brand">{msg}</p>}
        <button type="submit" className={`${sBtn} w-full`}>Salvar</button>
      </form>
      <section className={`${sCard} space-y-3`}>
        <h2 className="text-base font-bold uppercase tracking-wide text-brand">Segurança</h2>
        <label className={sLabel}><span>Nova senha</span><input className={sInput} type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <button type="button" className={`${sBtn} w-full`} onClick={changePw}>Alterar senha</button>
        <button type="button" className={`${sBtnOutline} w-full`} onClick={recover}>Recuperar senha por e-mail</button>
        {pwMsg && <p className="text-sm font-semibold text-brand">{pwMsg}</p>}
        <button type="button" className={`${sBtnOutline} w-full`} onClick={signOut}>Sair da conta</button>
      </section>
    </div>
  );
}
