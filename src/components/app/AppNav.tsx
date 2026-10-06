import { useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPanelAccess } from "@/lib/admin";
import { CalendarPlus, CalendarCheck, User, Contact, Scissors as ScissorsIcon, LogOut, Scissors, Settings, LayoutList, Wallet, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { clearGuest } from "@/lib/guest";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/app/NotificationBell";

const items = [
  { to: "/agendar", label: "Agendar", icon: CalendarPlus },
  { to: "/meus-agendamentos", label: "Agendamentos", icon: CalendarCheck },
  { to: "/minha-conta", label: "Minha conta", icon: User },
] as const;

export function AppNav() {
  const { session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessQuery = useQuery({
    queryKey: ["panel-access", session?.user.id],
    enabled: !!session,
    queryFn: getPanelAccess,
  });
  const access = accessQuery.data ?? null;
  const painel = { to: "/painel" as const, label: "Painel", icon: LayoutList, Wallet, Package };
  const navItems =
    access?.role === "admin"
      ? [
          painel,
          ...items,
          { to: "/financeiro" as const, label: "Financeiro", icon: Wallet },
          { to: "/estoque" as const, label: "Estoque", icon: Package },
          { to: "/configuracoes" as const, label: "Configurações", icon: Settings },
        ]
      : access?.role === "barbeiro"
        ? [
            painel,
            { to: "/meus-clientes" as const, label: "Clientes", icon: Contact },
            { to: "/meus-servicos" as const, label: "Serviços", icon: ScissorsIcon },
            { to: "/meus-produtos" as const, label: "Produtos", icon: Package },
            { to: "/financeiro" as const, label: "Meu Financeiro", icon: Wallet },
            { to: "/configuracoes" as const, label: "Configurações", icon: Settings },
          ]
        : access?.role === "barbeiro_pendente"
          ? [painel, items[2]]
        : items;

  const navRef = useRef<HTMLElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname, navItems.length]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearGuest();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto grid h-14 w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-4">
        <Link to="/agendar" className="flex min-w-0 items-center gap-2 text-foreground">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground">
            <Scissors className="h-5 w-5" />
          </span>
          <span className="min-w-0 truncate font-display text-sm font-bold tracking-tight sm:text-base">
            LA CREME BARBER
          </span>
        </Link>

        {session ? (
          <div className="flex shrink-0 items-center">
          <NotificationBell userId={session.user.id} />
          <Button
            type="button"
            variant="ghost"
            onClick={handleSignOut}
            aria-label="Sair"
            className="min-h-11 min-w-11 px-2 text-sm font-semibold text-foreground sm:px-3"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden min-[360px]:inline">Sair</span>
          </Button>
          </div>
        ) : (
          <Button asChild variant="ghost" className="min-h-11 px-3 text-sm font-semibold text-brand">
            <Link to="/auth" search={{ modo: "entrar" }}>
              Entrar
            </Link>
          </Button>
        )}
      </div>

      <nav ref={navRef} className="mx-auto flex w-full max-w-3xl snap-x gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] sm:grid sm:auto-cols-fr sm:grid-flow-col sm:overflow-visible" aria-label="Menu principal">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex min-h-12 min-w-[4.75rem] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-center text-[12px] leading-tight font-semibold text-foreground/70 hover:bg-secondary active:bg-secondary sm:min-w-0 sm:text-[13px]"
            activeProps={{ className: "bg-secondary text-brand" }}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
