import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPanelAccess } from "@/lib/admin";
import { CalendarPlus, CalendarCheck, User, Contact, Scissors as ScissorsIcon, LogOut, Scissors, Settings, LayoutList, Wallet, Package, Menu, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { clearGuest } from "@/lib/guest";
import { Button } from "@/components/ui/button";
import logo from "@/assets/la-creme-logo.png.asset.json";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  const painel = { to: "/painel" as const, label: "Painel", icon: LayoutList, Wallet, Package, Menu, MoreHorizontal };
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

  const [menuOpen, setMenuOpen] = useState(false);
  const hasMore = navItems.length > 5;
  const bottomItems = hasMore ? navItems.slice(0, 4) : navItems;

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
      <div className="mx-auto grid h-14 w-full max-w-3xl grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-2 sm:px-4">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button type="button" aria-label="Abrir menu" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-sidebar-accent">
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[17rem] flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="px-6 pt-10 pb-4">
              <img src={logo.url} alt="LA CREME BARBER" className="logo-blend mx-auto h-auto w-full max-w-[10rem]" />
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Menu completo">
              {navItems.map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent"
                  activeProps={{ className: "bg-sidebar-accent !text-sidebar-primary" }}>
                  <item.icon className="h-5 w-5 shrink-0 text-sidebar-primary" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-sidebar-border p-3">
              {session ? (
                <button type="button" onClick={handleSignOut} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium hover:bg-sidebar-accent">
                  <LogOut className="h-5 w-5" /> Sair
                </button>
              ) : (
                <Link to="/auth" search={{ modo: "entrar" }} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">Entrar</Link>
              )}
            </div>
          </SheetContent>
        </Sheet>
        <Link to="/agendar" className="flex min-w-0 justify-center" aria-label="LA CREME BARBER — início">
          <img src={logo.url} alt="LA CREME BARBER" className="logo-blend h-11 w-auto max-w-[9rem] object-contain" />
        </Link>
        <div className="flex min-w-11 shrink-0 items-center justify-end [&_button]:text-sidebar-foreground">
          {session ? <NotificationBell userId={session.user.id} /> : (
            <Link to="/auth" search={{ modo: "entrar" }} className="px-2 text-sm font-semibold text-sidebar-primary">Entrar</Link>
          )}
        </div>
      </div>
    </header>

    {/* Mobile bottom navigation */}
    <nav aria-label="Navegação principal" className="app-bottomnav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${bottomItems.length + (hasMore ? 1 : 0)}, minmax(0, 1fr))` }}>
        {bottomItems.map((item) => (
          <Link key={item.to} to={item.to}
            className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-tight text-foreground/55"
            activeProps={{ className: "!text-brand font-semibold [&_svg]:stroke-[2.4]" }}>
            <item.icon className="h-5 w-5" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        ))}
        {hasMore && (
          <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-foreground/55">
            <MoreHorizontal className="h-5 w-5" />
            Mais
          </button>
        )}
      </div>
    </nav>
    </>
  );
}
