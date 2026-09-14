import { Users } from "lucide-react";

export function Barbers() {
  return (
    <section id="barbeiros" className="bg-background py-16 lg:py-24">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[15px] font-bold uppercase text-foreground">
            Equipe
          </span>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Quem cuida de você
          </h2>
          <p className="mt-4 text-pretty text-base text-foreground/75">
            Em breve apresentaremos os profissionais que fazem parte da LA CREME BARBER.
          </p>
        </div>

        <div className="mt-10 rounded-lg border border-dashed border-border bg-card p-10 text-center shadow-sm sm:p-12">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand/10 text-brand">
            <Users className="h-8 w-8" />
          </div>
          <h3 className="mt-5 font-display text-xl font-semibold text-card-foreground">
            Equipe em atualização
          </h3>
          <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-foreground/75">
            A lista de barbeiros será publicada assim que o cadastro oficial for concluído.
            Enquanto isso, agende pelo WhatsApp para garantir seu horário.
          </p>
          <a
            href="https://wa.me/5516997335841"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-brand px-8 py-3 text-base font-bold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90"
          >
            Agendar pelo WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
