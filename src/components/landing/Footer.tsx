import { Link } from "@tanstack/react-router";
import { Scissors, Instagram } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";

const footerLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Serviços", href: "#servicos" },
  { label: "Barbeiros", href: "#barbeiros" },
  { label: "Agendar", href: "#agendar" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="container-tight">
        <div className="flex flex-col items-center gap-8 text-center">
          <Link
            to="/"
            className="flex items-center gap-2 text-foreground transition-colors hover:text-brand"
          >
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-brand-foreground">
              <Scissors className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">LA CREME BARBER</span>
          </Link>

          <nav className="flex flex-wrap justify-center gap-6">
            {footerLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex min-h-12 items-center text-base font-semibold text-foreground/75 transition-colors hover:text-brand"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <a
              href="#"
               className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-foreground/75 transition-colors hover:border-gold/60 hover:text-brand"
              aria-label="Instagram"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href="#"
               className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-foreground/75 transition-colors hover:border-gold/60 hover:text-brand"
              aria-label="Facebook"
            >
              <Facebook className="h-5 w-5" />
            </a>
          </div>

          <div className="w-full border-t border-border pt-8">
            <p className="font-display text-lg font-semibold text-gold">Só alegria</p>
            <p className="mt-2 text-[15px] text-foreground/70">
              © {new Date().getFullYear()} LA CREME BARBER. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
