import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { acceptBarberInvite, getBarberInvite } from "@/lib/invites.functions";

export const Route = createFileRoute("/convite/barbeiro/$token")({
  head: () => ({
    meta: [
      { title: "Ativar acesso | LA CREME BARBER" },
      { name: "description", content: "Ative seu acesso de barbeiro da LA CREME BARBER." },
      { property: "og:title", content: "Ativar acesso | LA CREME BARBER" },
      { property: "og:description", content: "Ative seu acesso de barbeiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

const inputClass =
  "min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";

const STATUS_MSG: Record<string, string> = {
  used: "Este link de ativação já foi utilizado. Se você já ativou, entre com seu e-mail e senha.",
  expired: "Este convite é inválido ou expirou. Peça um novo link ao administrador.",
  invalid: "Este convite é inválido ou expirou. Peça um novo link ao administrador.",
};

function InvitePage() {
  const { token } = Route.useParams();
  const { session, loading: sessionLoading } = useSession();
  const inviteQuery = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getBarberInvite({ data: { token } }).catch(() => ({ status: "invalid" as const, barberName: "" })),
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    const res = await acceptBarberInvite({ data: { token, email: email.trim(), password } }).catch(() => ({
      ok: false as const,
      error: "Não foi possível ativar o acesso.",
    }));
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    setDone(true);
    setBusy(false);
  }

  const status = inviteQuery.data?.status ?? "invalid";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-brand-foreground">
            <Scissors className="h-6 w-6" />
          </span>
          <span className="mt-3 font-display text-lg font-bold text-foreground">LA CREME BARBER</span>
        </div>
        {done ? (
          <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-5 text-center">
            <h1 className="font-display text-xl font-bold text-card-foreground">Cadastro concluído!</h1>
            <p className="text-base text-card-foreground">Seu acesso foi criado e está aguardando a ativação da administração.</p>
            <Link to="/auth" search={{ modo: "entrar" }} className="inline-block text-base font-semibold text-brand underline">Ir para Entrar</Link>
          </div>
        ) : inviteQuery.isLoading || sessionLoading ? (
          <p className="mt-6 text-center text-base text-foreground/70">Carregando...</p>
        ) : status === "ok" && session ? (
          <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-base text-card-foreground">
              Este aparelho está conectado na conta <strong>{session.user.email}</strong>. Para aceitar o convite de barbeiro, saia desta conta primeiro.
            </p>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="min-h-12 w-full rounded-md bg-brand px-6 text-base font-bold text-brand-foreground"
            >
              Sair e continuar o convite
            </button>
          </div>
        ) : inviteQuery.isLoading ? (
          <p className="mt-6 text-center text-base text-foreground/70">Carregando...</p>
        ) : status !== "ok" ? (
          <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-base text-card-foreground">{STATUS_MSG[status]}</p>
            <Link to="/auth" search={{ modo: "entrar" }} className="inline-block text-base font-semibold text-brand underline">
              Ir para Entrar
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={submit}>
            <h1 className="text-center font-display text-xl font-bold text-foreground">Ativação de acesso</h1>
            <p className="text-center text-base text-foreground/80">
              Olá, <strong>{inviteQuery.data?.barberName}</strong>.<br />
              Seu perfil de barbeiro foi criado pela administração da LA CREME BARBER. Informe seu e-mail e crie uma senha. Se você já tem cadastro como cliente, use o mesmo e-mail e a senha atual.
            </p>
            <input className={inputClass} type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className={inputClass} type="password" placeholder="Senha (mín. 6 caracteres)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <input className={inputClass} type="password" placeholder="Confirmar senha" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className="min-h-13 w-full rounded-md bg-brand px-6 text-base font-bold text-brand-foreground disabled:opacity-60">
              {busy ? "Criando..." : "CRIAR ACESSO"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
