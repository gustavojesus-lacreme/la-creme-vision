import { Award, Users, Sparkles } from "lucide-react";

const highlights = [
  {
    icon: Award,
    title: "Excelência",
    description: "Profissionais treinados para entregar o melhor resultado em cada corte.",
  },
  {
    icon: Users,
    title: "Atendimento personalizado",
    description: "Entendemos seu estilo e indicamos o visual que combina com você.",
  },
  {
    icon: Sparkles,
    title: "Ambiente premium",
    description: "Espaço pensado para seu conforto, com design moderno e acolhedor.",
  },
];

export function About() {
  return (
    <section id="sobre" className="bg-background py-16 lg:py-24">
      <div className="container-tight">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <span className="text-[15px] font-bold uppercase text-brand">
              Sobre nós
            </span>
            <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              A barbearia que eleva seu estilo
            </h2>
            <p className="mt-6 text-pretty text-base leading-relaxed text-foreground/80 sm:text-lg">
              A LA CREME BARBER nasceu para oferecer mais do que um simples corte. Aqui, cada 
              detalhe é cuidadosamente planejado para que você se sinta no seu melhor momento. 
              Unimos técnica, produtos de qualidade e um atendimento que faz a diferença.
            </p>
            <p className="mt-4 text-pretty text-base leading-relaxed text-foreground/80 sm:text-lg">
              Seja para um corte clássico, uma barba desenhada ou um tratamento completo, nosso 
              time está pronto para transformar sua aparência com precisão e estilo.
            </p>

            <p className="mt-6 text-pretty text-base leading-relaxed text-foreground/80 sm:text-lg">
              Nosso compromisso é com a qualidade, a higiene e a satisfação de quem senta na nossa
              cadeira. Cada atendimento é uma oportunidade de entregar um resultado que traduza
              confiança e estilo.
            </p>
          </div>

          <div className="grid gap-4">
            {highlights.map((item) => (
              <div
                key={item.title}
                className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-gold/50"
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-card-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-foreground/75">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
