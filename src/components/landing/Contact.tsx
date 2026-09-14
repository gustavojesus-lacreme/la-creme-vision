import { MapPin, Phone, Clock } from "lucide-react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

const contactInfo = [
  {
    icon: MapPin,
    label: "Endereço",
    value: "Rua Francisco Isidoro da Silva, nº 85 - Ribeirão Preto - SP, CEP 14079-384",
    href: "https://maps.google.com/?q=Rua+Francisco+Isidoro+da+Silva,+85,+Ribeirão+Preto+-+SP,+14079-384",
  },
  {
    icon: Phone,
    label: "WhatsApp",
    value: "(16) 99733-5841",
    href: "https://wa.me/5516997335841",
  },
  {
    icon: Clock,
    label: "Atendimento",
    value: "Ter a Sex: 09h às 19h",
    href: "#horarios",
  },
];

export function Contact() {
  return (
    <section id="agendar" className="bg-background py-16 lg:py-24">
      <div className="container-tight">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="text-[15px] font-bold uppercase text-brand">Contato</span>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Agende seu horário
            </h2>
            <p className="mt-6 text-pretty text-base leading-relaxed text-foreground/80 sm:text-lg">
              Consulte os horários e veja como será a experiência de agendamento. Os dados abaixo
              são apenas ilustrativos nesta etapa.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {contactInfo.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="group flex min-h-12 items-start gap-4 overflow-hidden rounded-lg border border-border bg-card p-5 transition-colors hover:border-gold/50"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-foreground/70">{item.label}</div>
                    <div className="mt-1 break-words text-base font-semibold text-card-foreground">
                      {item.value}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8 lg:p-10">
            <h3 className="font-display text-2xl font-bold text-card-foreground">
              Solicitar agendamento
            </h3>
            <div className="mt-4 flex items-start gap-3 rounded-md border border-gold/50 bg-gold/10 p-4 text-foreground">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <p className="text-base font-semibold leading-relaxed">
                Demonstração visual — O agendamento online completo será ativado na próxima etapa
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={(e) => e.preventDefault()}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-base font-semibold text-card-foreground">
                    Nome
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Seu nome completo"
                    className="min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-foreground/55 focus:border-brand focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-base font-semibold text-card-foreground">
                    Telefone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="(11) 99999-9999"
                    className="min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-foreground/55 focus:border-brand focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="service" className="text-base font-semibold text-card-foreground">
                  Serviço de interesse
                </label>
                <select
                  id="service"
                  className="min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione um serviço</option>
                  <option value="corte">Corte de cabelo</option>
                  <option value="barba">Barba desenhada</option>
                  <option value="combo">Corte + Barba</option>
                  <option value="luzes">Luzes</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="message" className="text-base font-semibold text-card-foreground">
                  Mensagem
                </label>
                <textarea
                  id="message"
                  rows={4}
                  placeholder="Informe o dia e horário desejados"
                  className="w-full resize-none rounded-md border border-input bg-background px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-foreground/55 focus:border-brand focus:ring-2 focus:ring-ring"
                />
              </div>

              <Button
                type="submit"
                className="h-12 w-full px-6 text-base font-bold"
              >
                Enviar solicitação
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
