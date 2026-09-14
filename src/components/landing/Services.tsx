import { Scissors } from "lucide-react";

export function Services() {
  return (
    <section id="servicos" className="bg-secondary/60 py-16 lg:py-24">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[15px] font-bold uppercase text-brand">Serviços</span>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Serviços
          </h2>
          <p className="mt-4 text-pretty text-base text-foreground/75">
            Consulte nossa equipe para conhecer os atendimentos disponíveis.
          </p>
        </div>

        <div className="mt-10 rounded-lg border border-border bg-card p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-brand/10 text-brand">
            <Scissors className="h-7 w-7" />
          </div>
          <h3 className="mt-5 font-display text-xl font-semibold text-card-foreground">
            Informações em atualização
          </h3>
          <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-foreground/75">
            A relação oficial de serviços e valores será publicada em breve.
          </p>
        </div>

        <div className="mt-12 text-center">
          <a
            href="#agendar"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-brand px-8 py-3 text-base font-bold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90"
          >
            Agendar agora
          </a>
        </div>
      </div>
    </section>
  );
}
