import { MapPin, Phone, Mail, Clock } from "lucide-react";

const contactInfo = [
  {
    icon: MapPin,
    label: "Endereço",
    value: "Av. Paulista, 1000 - Bela Vista, São Paulo - SP",
    href: "#",
  },
  {
    icon: Phone,
    label: "Telefone",
    value: "(11) 99999-9999",
    href: "tel:+5511999999999",
  },
  {
    icon: Mail,
    label: "E-mail",
    value: "contato@lacremebarber.com.br",
    href: "mailto:contato@lacremebarber.com.br",
  },
  {
    icon: Clock,
    label: "Atendimento",
    value: "Seg a Sex: 09h - 21h",
    href: "#horarios",
  },
];

export function Contact() {
  return (
    <section id="agendar" className="bg-background py-20 lg:py-28">
      <div className="container-tight">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="text-sm font-bold uppercase tracking-widest text-brand">Contato</span>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Agende seu horário
            </h2>
            <p className="mt-6 text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
              Escolha o melhor dia e horário para sua visita. Em breve, o agendamento online estará 
              disponível diretamente por aqui. Por enquanto, entre em contato pelos canais abaixo.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {contactInfo.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-md"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-muted-foreground">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-card-foreground sm:text-base">
                      {item.value}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:p-10">
            <h3 className="font-display text-2xl font-bold text-card-foreground">
              Solicitar agendamento
            </h3>
            <p className="mt-2 text-muted-foreground">
              Preencha seus dados e entraremos em contato para confirmar seu horário.
            </p>

            <form className="mt-8 space-y-5" onSubmit={(e) => e.preventDefault()}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-card-foreground">
                    Nome
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Seu nome completo"
                    className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-card-foreground">
                    Telefone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="service" className="text-sm font-medium text-card-foreground">
                  Serviço de interesse
                </label>
                <select
                  id="service"
                  className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione um serviço</option>
                  <option value="corte">Corte de cabelo</option>
                  <option value="barba">Barba desenhada</option>
                  <option value="combo">Corte + Barba</option>
                  <option value="premium">Tratamento premium</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-card-foreground">
                  Mensagem
                </label>
                <textarea
                  id="message"
                  rows={4}
                  placeholder="Informe o dia e horário desejados"
                  className="w-full resize-none rounded-md border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-ring"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-brand px-6 py-4 text-base font-bold text-brand-foreground shadow-sm transition-all hover:bg-brand/90 hover:shadow-md"
              >
                Enviar solicitação
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
