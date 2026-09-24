import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isBarberAdmin } from "@/lib/admin";
import { CalendarPlus, CalendarCheck, User, LogOut, Scissors, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { clearGuest } from "@/lib/guest";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/agendar", label: "Agendar", icon: CalendarPlus },
  { to: "/meus-agendamentos", label: "Agendamentos", icon: CalendarCheck },
  { to: "/minha-conta", label: "Minha conta", icon: User },
] as const;

export function AppNav() {
  const { session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const adminQuery = useQuery({
    queryKey: ["is-admin", session?.user.id],
    enabled: !!session,
    queryFn: isBarberAdmin,
  });
  const navItems = adminQuery.data
    ? [...items, { to: "/admin-servicos" as const, label: "Serviços", icon: Settings }]
    : items;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearGuest();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4">
        <Link to="/agendar" className="flex items-center gap-2 text-foreground">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground">
            <Scissors className="h-5 w-5" />
          </span>
          <span className="truncate font-display text-base font-bold tracking-tight">
            LA CREME BARBER
          </span>
        </Link>

        {session ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleSignOut}
            className="min-h-11 px-3 text-sm font-semibold text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        ) : (
          <Button asChild variant="ghost" className="min-h-11 px-3 text-sm font-semibold text-brand">
            <Link to="/auth" search={{ modo: "entrar" }}>
              Entrar
            </Link>
          </Button>
        )}
      </div>

      <nav className="mx-auto flex w-full max-w-3xl gap-1 px-2 pb-2" aria-label="Menu principal">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-2 text-[13px] font-semibold text-foreground/70 hover:bg-secondary"
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
