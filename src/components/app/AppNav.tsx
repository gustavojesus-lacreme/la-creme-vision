import { useEffect, useRef } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPanelAccess } from "@/lib/admin";
import { CalendarPlus, CalendarCheck, User, Contact, Scissors as ScissorsIcon, LogOut, Scissors, Settings, LayoutList, Wallet, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { clearGuest } from "@/lib/guest";
import { Button } from "@/components/ui/button";
import logo from "@/assets/la-creme-logo.png.asset.json";
import { NotificationBell } from "@/components/app/NotificationBell";

const items = [
  { to: "/agendar", label: "Agendar", icon: CalendarPlus },
  { to: "/meus-agendamentos", label: "Agendamentos", icon: CalendarCheck },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
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
          items[0], items[1],
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

  const signOutBtn = (
    <Button type="button" variant="ghost" onClick={handleSignOut} aria-label="Sair"
      className="min-h-11 min-w-11 px-2 text-sm font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground sm:px-3">
      <LogOut className="h-4 w-4" />
      <span className="hidden min-[360px]:inline">Sair</span>
    </Button>
  );

  return (
    <>
    {/* Desktop sidebar */}
    <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <Link to="/agendar" className="block px-5 pt-6 pb-4" aria-label="LA CREME BARBER — início">
        <img src={logo.url} alt="LA CREME BARBER" className="logo-blend mx-auto h-auto w-full max-w-[11rem]" />
      </Link>
      <div className="mx-5 h-px bg-sidebar-border" />
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Menu principal">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to}
            className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeProps={{ className: "bg-sidebar-accent !text-sidebar-primary shadow-[inset_2px_0_0_var(--color-sidebar-primary)]" }}>
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-3 py-3">
        {session ? (<><NotificationBell userId={session.user.id} />{signOutBtn}</>) : (
          <Button asChild className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
            <Link to="/auth" search={{ modo: "entrar" }}>Entrar</Link>
          </Button>
        )}
      </div>
    </aside>

    {/* Mobile / tablet header */}
    <header className="sticky top-0 z-40 bg-sidebar text-sidebar-foreground shadow-sm lg:hidden">
      <div className="mx-auto grid h-14 w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-4">
        <Link to="/agendar" className="flex min-w-0 items-center" aria-label="LA CREME BARBER — início">
          <img src={logo.url} alt="LA CREME BARBER" className="logo-blend h-11 w-auto max-w-[9.5rem] object-contain" />
        </Link>
        {session ? (
          <div className="flex shrink-0 items-center [&_button]:text-sidebar-foreground">
            <NotificationBell userId={session.user.id} />
            {signOutBtn}
          </div>
        ) : (
          <Button asChild variant="ghost" className="min-h-11 px-3 text-sm font-semibold text-sidebar-primary hover:bg-sidebar-accent">
            <Link to="/auth" search={{ modo: "entrar" }}>Entrar</Link>
          </Button>
        )}
      </div>
      <nav ref={navRef} className="mx-auto flex w-full max-w-3xl snap-x gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] sm:grid sm:auto-cols-fr sm:grid-flow-col sm:overflow-visible" aria-label="Menu principal">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to}
            className="flex min-h-12 min-w-[4.75rem] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-center text-[12px] leading-tight font-semibold text-sidebar-foreground/70 hover:bg-sidebar-accent sm:min-w-0 sm:text-[13px]"
            activeProps={{ className: "bg-sidebar-accent !text-sidebar-primary" }}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
    </>
  );
}
