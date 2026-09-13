import barber1 from "@/assets/barber-1.jpg";
import barber2 from "@/assets/barber-2.jpg";
import barber3 from "@/assets/barber-3.jpg";
import { Instagram } from "lucide-react";

const barbers = [
  {
    name: "André Silva",
    role: "Especialista em cortes",
    image: barber1,
    instagram: "#",
  },
  {
    name: "Marcos Oliveira",
    role: "Mestre da barba",
    image: barber2,
    instagram: "#",
  },
  {
    name: "Rafael Costa",
    role: "Barbeiro premium",
    image: barber3,
    instagram: "#",
  },
];

export function Barbers() {
  return (
    <section id="barbeiros" className="bg-background py-20 lg:py-28">
      <div className="container-tight">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-bold uppercase tracking-widest text-brand">Barbeiros</span>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Quem cuida de você
          </h2>
          <p className="mt-4 text-balance text-muted-foreground">
            Um time de profissionais apaixonados pelo ofício, prontos para entregar o seu melhor visual.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {barbers.map((barber) => (
            <div
              key={barber.name}
              className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <img
                  src={barber.image}
                  alt={`Foto do barbeiro ${barber.name}`}
                  width={800}
                  height={1008}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-soft-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <a
                  href={barber.instagram}
                  className="absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-gold text-gold-foreground opacity-0 transition-all duration-300 hover:bg-gold/90 group-hover:opacity-100"
                  aria-label={`Instagram de ${barber.name}`}
                >
                  <Instagram className="h-5 w-5" />
                </a>
              </div>
              <div className="p-6 text-center">
                <h3 className="font-display text-xl font-semibold text-card-foreground">
                  {barber.name}
                </h3>
                <p className="mt-1 text-sm font-medium text-brand">{barber.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
