import { Clock } from "lucide-react";

const schedule = [
  { day: "Segunda-feira", hours: "09:00 - 19:00" },
  { day: "Terça-feira", hours: "09:00 - 19:00" },
  { day: "Quarta-feira", hours: "09:00 - 21:00" },
  { day: "Quinta-feira", hours: "09:00 - 21:00" },
  { day: "Sexta-feira", hours: "09:00 - 21:00" },
  { day: "Sábado", hours: "09:00 - 18:00" },
  { day: "Domingo", hours: "Fechado" },
];

export function Hours() {
  return (
    <section id="horarios" className="bg-soft-black py-20 text-soft-black-foreground lg:py-28">
      <div className="container-tight">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <span className="text-sm font-bold uppercase tracking-widest text-gold">
              Horários
            </span>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Estamos esperando por você
            </h2>
            <p className="mt-6 text-balance text-base leading-relaxed text-soft-black-foreground/70 sm:text-lg">
              Planeje sua visita nos horários abaixo. Aos finais de semana, recomendamos agendar 
              com antecedência para garantir seu horário preferido.
            </p>

            <div className="mt-8 inline-flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/10 px-5 py-3">
              <Clock className="h-5 w-5 text-gold" />
              <span className="text-sm font-medium text-gold">
                Atendimento com hora marcada e walk-in
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-soft-black-foreground/10 bg-soft-black-foreground/5 p-2">
            <div className="divide-y divide-soft-black-foreground/10 rounded-xl bg-soft-black/50">
              {schedule.map((item) => (
                <div
                  key={item.day}
                  className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5"
                >
                  <span className="font-medium text-soft-black-foreground/90">{item.day}</span>
                  <span
                    className={`font-display text-base font-semibold sm:text-lg ${
                      item.hours === "Fechado" ? "text-destructive-foreground" : "text-gold"
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
