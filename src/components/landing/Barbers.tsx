import barber1 from "@/assets/barber-1.jpg";
import barber2 from "@/assets/barber-2.jpg";
import barber3 from "@/assets/barber-3.jpg";

const barbers = [
  {
    name: "André Silva",
    role: "Especialista em cortes",
    image: barber1,
  },
  {
    name: "Marcos Oliveira",
    role: "Mestre da barba",
    image: barber2,
  },
  {
    name: "Rafael Costa",
    role: "Barbeiro premium",
    image: barber3,
  },
];

export function Barbers() {
  return (
    <section id="barbeiros" className="bg-background py-16 lg:py-24">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[15px] font-bold uppercase text-foreground">
            Equipe de demonstração
          </span>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Quem cuida de você
          </h2>
          <p className="mt-4 text-pretty text-base text-foreground/75">
            Perfis ilustrativos para apresentar como a escolha do profissional funcionará.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {barbers.map((barber) => (
            <div
              key={barber.name}
              className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-gold/60"
            >
              <div className="relative aspect-[4/3] overflow-hidden sm:aspect-[4/5] lg:aspect-[4/3]">
                <img
                  src={barber.image}
                  alt={`Foto do barbeiro ${barber.name}`}
                  width={800}
                  height={1008}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-5 text-center">
                <h3 className="font-display text-xl font-semibold text-card-foreground">
                  {barber.name}
                </h3>
                <p className="mt-1 text-base font-medium text-foreground/75">{barber.role}</p>
                <a
                  href="#agendar"
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand px-4 py-3 text-center text-base font-bold text-brand-foreground transition-colors hover:bg-brand/90"
                >
                  Agendar com este barbeiro
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
