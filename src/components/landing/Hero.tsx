import heroImage from "@/assets/hero-barbershop.jpg";

export function Hero() {
  return (
    <section
      id="inicio"
      className="relative flex min-h-[88svh] items-center justify-center overflow-hidden pt-16"
    >
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt="Interior moderno e elegante da LA CREME BARBER"
          width={1920}
          height={1088}
          className="h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-soft-black/75" />
      </div>

      <div className="container-tight relative z-10 py-20">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-gold/40 bg-soft-black/50 px-4 py-2 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-gold" />
            <span className="text-[15px] font-semibold text-gold">Experiência premium de cuidado masculino</span>
          </div>

          <h1 className="text-balance font-display text-4xl font-bold leading-tight text-off-white sm:text-6xl md:text-7xl lg:text-8xl">
            Acredita que acontece
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-off-white sm:text-xl">
            Na LA CREME BARBER, transformamos seu visual em uma experiência de alto padrão. 
            Cuidado masculino com o estilo que você merece.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href="#agendar"
               className="inline-flex min-h-12 items-center justify-center rounded-md bg-brand px-8 py-3 text-base font-bold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90"
            >
              Agendar horário
            </a>
            <a
              href="#servicos"
               className="inline-flex min-h-12 items-center justify-center rounded-md border border-off-white/50 bg-soft-black/40 px-8 py-3 text-base font-semibold text-off-white backdrop-blur-sm transition-colors hover:bg-soft-black/60"
            >
              Conhecer serviços
            </a>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 motion-safe:animate-bounce md:block">
        <div className="h-12 w-6 rounded-full border-2 border-off-white/40 p-1">
          <div className="h-2.5 w-full rounded-full bg-gold" />
        </div>
      </div>
    </section>
  );
}
