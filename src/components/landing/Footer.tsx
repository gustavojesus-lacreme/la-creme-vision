import { Link } from "@tanstack/react-router";
import { Scissors, Instagram } from "lucide-react";

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
              href="https://www.instagram.com/lacreme.barber/"
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-foreground/75 transition-colors hover:border-gold/60 hover:text-brand"
              aria-label="Instagram"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href="https://wa.me/5516997335841"
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-foreground/75 transition-colors hover:border-gold/60 hover:text-brand"
              aria-label="WhatsApp"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26 9.99 9.99 0 0117.638-6.455 9.88 9.88 0 011.958 6.03 9.995 9.995 0 01-10.692 9.917M20.525 3.51A11.933 11.933 0 0012 0C5.373 0 0 5.373 0 12c0 2.11.552 4.177 1.6 6l-1.044 3.82 3.901-1.025A11.947 11.947 0 0012 24c6.627 0 12-5.373 12-12a11.91 11.91 0 00-4.475-9.49Z" />
              </svg>
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
