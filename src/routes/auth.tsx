import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import logo from "@/assets/la-creme-logo-tight.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/useSession";
import { saveGuest, fetchGuestBookingEnabled, isValidBrWhatsapp } from "@/lib/guest";

type Modo = "entrar" | "cadastro" | "visitante";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { modo: Modo } => ({
    modo:
      search['modo'] === "cadastro"
        ? "cadastro"
        : search['modo'] === "visitante"
          ? "visitante"
          : "entrar",
  }),
  head: () => ({
    meta: [
      { title: "Entrar | LA CREME BARBER" },
      { name: "description", content: "Acesse sua conta para agendar e ver seus horários." },
      { property: "og:title", content: "Entrar | LA CREME BARBER" },
      { property: "og:description", content: "Acesse sua conta na LA CREME BARBER." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { modo } = Route.useSearch();
  const navigate = useNavigate();
  const { session } = useSession();

  const [mode, setMode] = useState<Modo>(modo);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate({ to: "/agendar", replace: true });
  }, [session, navigate]);

  useEffect(() => {
    if (mode !== "visitante") return;
    fetchGuestBookingEnabled().then((on) => { if (!on) setMode("entrar"); });
  }, [mode]);

  function handleGuest(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (firstName.trim().length < 2) {
      setError("Informe seu nome para continuar.");
      return;
    }
    if (!isValidBrWhatsapp(whatsapp)) {
      setError("Informe um WhatsApp válido, com DDD e 9 dígitos (ex.: 11 98765-4321).");
      return;
    }
    saveGuest({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      whatsapp: whatsapp.trim(),
    });
    navigate({ to: "/agendar", replace: true });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    if (mode === "entrar") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        const msg = signInError.message.toLowerCase();
        if (msg.includes("email not confirmed")) {
          setError("Confirme seu e-mail pelo link que enviamos antes de entrar.");
        } else if (msg.includes("invalid login")) {
          setError("E-mail ou senha incorretos. Verifique os dados e tente novamente.");
        } else {
          setError(signInError.message);
        }
      } else {
        navigate({ to: "/agendar", replace: true });
      }
    } else {
      if (firstName.trim().length < 2 || lastName.trim().length < 2 || !isValidBrWhatsapp(whatsapp)) {
        setError("Preencha nome, sobrenome e um WhatsApp válido com DDD (ex.: (11) 98765-4321).");
        setBusy(false);
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { first_name: firstName, last_name: lastName, whatsapp },
        },
      });
      const alreadyRegistered =
        signUpError?.message.toLowerCase().includes("already registered") ||
        signUpError?.message.toLowerCase().includes("already been registered") ||
        (!signUpError && data.user && (data.user.identities?.length ?? 0) === 0);

      if (alreadyRegistered) {
        setError("Este e-mail já possui cadastro. Use a opção Entrar ou recupere sua senha.");
      } else if (signUpError) {
        const msg = signUpError.message.toLowerCase();
        if (msg.includes("weak") || msg.includes("easy to guess") || msg.includes("pwned")) {
          setError("Essa senha é muito comum e fácil de adivinhar. Escolha outra, misturando letras, números e símbolos (ex.: Corte@2026).");
        } else if (msg.includes("password")) {
          setError("Senha muito curta. Use pelo menos 6 caracteres.");
        } else if (msg.includes("invalid") && msg.includes("email")) {
          setError("E-mail inválido. Confira o endereço digitado.");
        } else {
          setError(signUpError.message);
        }
      } else if (!data.session) {
        setMessage("Cadastro criado. Confira seu e-mail para confirmar e depois entre.");
      } else {
        navigate({ to: "/agendar", replace: true });
      }
    }


    setBusy(false);
  }

  async function handleGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Não foi possível entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/agendar", replace: true });
  }

  const inputClass =
    "min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-ring";

  return (
    <main className="grid min-h-svh bg-sidebar lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Link to="/" aria-label="LA CREME BARBER — início" className="flex items-center justify-center px-6 pt-6 pb-4 lg:p-12">
        <img src={logo.url} alt="LA CREME BARBER" className="logo-blend h-auto w-full max-w-[16rem] lg:max-w-md" />
      </Link>
      <div className="flex flex-col items-center rounded-t-3xl bg-background px-5 py-10 lg:justify-center lg:rounded-none">
      <div className="w-full max-w-sm">

        {mode === "visitante" ? (
          <form className="mt-6 space-y-3" onSubmit={handleGuest}>
            <h1 className="text-center font-display text-lg font-bold text-foreground">
              Continuar como visitante
            </h1>
            <input
              className={inputClass}
              placeholder="Nome"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
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
              required
            />
            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            <button
              type="submit"
              className="min-h-13 w-full rounded-md bg-brand px-6 text-base font-bold text-brand-foreground"
            >
              Continuar
            </button>
            <Link
              to="/"
              className="flex min-h-12 items-center justify-center text-base font-semibold text-foreground/70 underline underline-offset-4"
            >
              Voltar
            </Link>
          </form>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
              {(["entrar", "cadastro"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`min-h-11 rounded-md text-sm font-bold ${
                    mode === value ? "bg-background text-brand shadow-sm" : "text-foreground/70"
                  }`}
                >
                  {value === "entrar" ? "Entrar" : "Criar cadastro"}
                </button>
              ))}
            </div>

            <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
              {mode === "cadastro" && (
                <>
                  <input
                    className={inputClass}
                    placeholder="Nome"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                  <input
                    className={inputClass}
                    placeholder="Sobrenome"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                  <input
                    className={inputClass}
                    placeholder="WhatsApp"
                    inputMode="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    required
                  />
                </>
              )}
              <input
                className={inputClass}
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className={inputClass}
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />

              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
              {message && <p className="text-sm font-semibold text-brand">{message}</p>}

              <button
                type="submit"
                disabled={busy}
                className="min-h-13 w-full rounded-md bg-brand px-6 text-base font-bold text-brand-foreground disabled:opacity-60"
              >
                {mode === "entrar" ? "Entrar" : "Criar cadastro"}
              </button>
            </form>

            <button
              type="button"
              onClick={handleGoogle}
              className="mt-3 min-h-13 w-full rounded-md border border-input bg-background px-6 text-base font-semibold text-foreground"
            >
              Continuar com Google
            </button>

            <Link
              to="/"
              className="mt-4 flex min-h-12 items-center justify-center text-base font-semibold text-foreground/70 underline underline-offset-4"
            >
              Voltar
            </Link>
          </>
        )}
      </div>
      </div>
    </main>
  );
}
