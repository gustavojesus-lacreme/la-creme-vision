import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Serviços", href: "#servicos" },
  { label: "Barbeiros", href: "#barbeiros" },
  { label: "Agendar", href: "#agendar" },
  { label: "Entrar", href: "#entrar" },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="container-tight">
        <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 text-soft-black transition-colors hover:text-brand"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground">
              <Scissors className="h-5 w-5" />
            </div>
            <span className="truncate font-display text-lg font-bold tracking-tight">
              LA CREME BARBER
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex min-h-12 items-center rounded-md px-3 text-base font-semibold text-foreground transition-colors hover:bg-secondary hover:text-brand"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:block">
            <Button asChild className="h-12 px-5 text-base font-bold">
              <a href="#agendar">Agendar horário</a>
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((v) => !v)}
            className="h-12 w-12 shrink-0 text-foreground lg:hidden"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/50 bg-background lg:hidden">
          <nav className="container-tight flex flex-col gap-1 py-4" aria-label="Navegação mobile">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="flex min-h-12 items-center rounded-md px-3 text-base font-semibold text-foreground transition-colors hover:bg-secondary hover:text-brand"
              >
                {link.label}
              </a>
            ))}
            <Button asChild className="mt-2 h-12 text-base font-bold">
              <a href="#agendar" onClick={() => setMobileOpen(false)}>
                Agendar horário
              </a>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
