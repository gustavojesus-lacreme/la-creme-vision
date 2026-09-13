import { Scissors, FlaskConical, Sparkles, Crown } from "lucide-react";

const services = [
  {
    icon: Scissors,
    title: "Corte de cabelo",
    description: "Corte moderno ou clássico, finalizado com produtos premium para um visual impecável.",
    price: "R$ 50",
    time: "45 min",
  },
  {
    icon: FlaskConical,
    title: "Barba desenhada",
    description: "Modelagem completa da barba com toalha quente, produtos e acabamento preciso.",
    price: "R$ 40",
    time: "30 min",
  },
  {
    icon: Sparkles,
    title: "Corte + Barba",
    description: "O combo perfeito para quem quer sair renovado do salão em uma sessão completa.",
    price: "R$ 80",
    time: "75 min",
  },
  {
    icon: Crown,
    title: "Tratamento premium",
    description: "Hidratação capilar, esfoliação facial e cuidados especiais para você se sentir no topo.",
    price: "R$ 120",
    time: "90 min",
  },
];

export function Services() {
  return (
    <section id="servicos" className="bg-secondary/40 py-20 lg:py-28">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-bold uppercase tracking-widest text-brand">Serviços</span>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Escolha sua experiência
          </h2>
          <p className="mt-4 text-balance text-muted-foreground">
            Serviços pensados para o homem moderno, com qualidade, precisão e aquele toque especial.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <div
              key={service.title}
              className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-gold/40 hover:shadow-lg"
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                <service.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-card-foreground">
                {service.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {service.description}
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <span className="font-display text-2xl font-bold text-brand">{service.price}</span>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  {service.time}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <a
            href="#agendar"
            className="inline-flex items-center justify-center rounded-md bg-brand px-8 py-4 text-base font-bold text-brand-foreground shadow-sm transition-all hover:bg-brand/90 hover:shadow-md"
          >
            Agendar agora
          </a>
        </div>
      </div>
    </section>
  );
}
