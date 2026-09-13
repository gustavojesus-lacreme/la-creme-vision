import { Clock } from "lucide-react";

const schedule = [
  { day: "Terça a sexta", hours: "09:00 às 19:00" },
  { day: "Sábado", hours: "08:00 às 17:00" },
  { day: "Domingo", hours: "Fechado" },
  { day: "Segunda-feira", hours: "Fechado" },
];

export function Hours() {
  return (
    <section id="horarios" className="bg-soft-black py-16 text-soft-black-foreground lg:py-24">
      <div className="container-tight">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <span className="text-[15px] font-bold uppercase text-gold">
              Horários
            </span>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Estamos esperando por você
            </h2>
            <p className="mt-6 text-pretty text-base leading-relaxed text-soft-black-foreground/85 sm:text-lg">
              Planeje sua visita nos horários abaixo. Aos sábados, recomendamos agendar com
              antecedência para garantir seu horário preferido.
            </p>

            <div className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 px-5 py-3">
              <Clock className="h-5 w-5 text-gold" />
              <span className="text-[15px] font-semibold text-gold">
                Atendimento com hora marcada
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-soft-black-foreground/20 bg-soft-black-foreground/5 p-2">
            <div className="divide-y divide-soft-black-foreground/15 rounded-md bg-soft-black/50">
              {schedule.map((item) => (
                <div
                  key={item.day}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-5 sm:px-6"
                >
                   <span className="min-w-0 text-base font-semibold text-soft-black-foreground">{item.day}</span>
                  <span
                    className={`font-display text-base font-semibold sm:text-lg ${
                       item.hours === "Fechado" ? "text-soft-black-foreground/70" : "text-gold"
                    }`}
                  >
                    {item.hours}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
