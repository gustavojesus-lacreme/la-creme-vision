import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, Scissors } from "lucide-react";

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

          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-brand"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:block">
            <a
              href="#agendar"
              className="inline-flex items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition-all hover:bg-brand/90 hover:shadow-md"
            >
              Agendar horário
            </a>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-foreground transition-colors hover:bg-secondary lg:hidden"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/50 bg-background lg:hidden">
          <nav className="container-tight flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-brand"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#agendar"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-brand px-5 py-3 text-center text-base font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
            >
              Agendar horário
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
