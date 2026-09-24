import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { acceptBarberInvite, getBarberInvite } from "@/lib/invites.functions";

export const Route = createFileRoute("/convite/$token")({
  head: () => ({
    meta: [
      { title: "Convite de barbeiro | LA CREME BARBER" },
      { name: "description", content: "Complete seu acesso como barbeiro da LA CREME BARBER." },
      { property: "og:title", content: "Convite de barbeiro | LA CREME BARBER" },
      { property: "og:description", content: "Complete seu acesso como barbeiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

const inputClass =
  "min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const inviteQuery = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getBarberInvite({ data: { token } }).catch(() => null),
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    const res = await acceptBarberInvite({ data: { token, email: email.trim(), password } }).catch(() => ({
      ok: false as const,
      error: "Não foi possível criar o acesso.",
    }));
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    await supabase.auth.signInWithPassword({ email: email.trim(), password });
    navigate({ to: "/painel", replace: true });
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-brand-foreground">
            <Scissors className="h-6 w-6" />
          </span>
          <span className="mt-3 font-display text-lg font-bold text-foreground">LA CREME BARBER</span>
        </div>
        {inviteQuery.isLoading ? (
          <p className="mt-6 text-center text-base text-foreground/70">Carregando...</p>
        ) : !inviteQuery.data ? (
          <div className="mt-6 space-y-3 text-center">
            <p className="text-base text-foreground/80">Convite inválido, expirado ou já utilizado.</p>
            <Link to="/" className="text-base font-semibold text-brand underline">Voltar</Link>
          </div>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={submit}>
            <h1 className="text-center font-display text-lg font-bold text-foreground">
              Olá, {inviteQuery.data.barberName}
            </h1>
            <p className="text-center text-sm text-foreground/70">Crie seu acesso de barbeiro.</p>
            <input className={inputClass} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className={inputClass} type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <input className={inputClass} type="password" placeholder="Confirmar senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className="min-h-13 w-full rounded-md bg-brand px-6 text-base font-bold text-brand-foreground disabled:opacity-60">
              Criar acesso
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
