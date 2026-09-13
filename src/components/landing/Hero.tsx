import heroImage from "@/assets/hero-barbershop.jpg";

export function Hero() {
  return (
    <section
      id="inicio"
      className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16"
    >
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt="Interior moderno e elegante da LA CREME BARBER"
          width={1920}
          height={1088}
          className="h-full w-full object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-soft-black/90 via-soft-black/70 to-soft-black/40" />
      </div>

      <div className="container-tight relative z-10 py-20">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-gold" />
            <span className="text-sm font-medium text-gold">Experiência premium de cuidado masculino</span>
          </div>

          <h1 className="text-balance font-display text-5xl font-bold leading-[0.95] tracking-tight text-off-white sm:text-6xl md:text-7xl lg:text-8xl">
            Acredita que acontece
          </h1>

          <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-off-white/80 sm:text-xl">
            Na LA CREME BARBER, transformamos seu visual em uma experiência de alto padrão. 
            Corte, barba e cuidado masculino com o estilo que você merece.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href="#agendar"
              className="inline-flex items-center justify-center rounded-md bg-gold px-8 py-4 text-base font-bold text-gold-foreground shadow-lg shadow-gold/20 transition-all hover:bg-gold/90 hover:shadow-xl"
            >
              Agendar horário
            </a>
            <a
              href="#servicos"
              className="inline-flex items-center justify-center rounded-md border border-off-white/30 bg-off-white/10 px-8 py-4 text-base font-semibold text-off-white backdrop-blur-sm transition-all hover:bg-off-white/20"
            >
              Conhecer serviços
            </a>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 animate-bounce md:block">
        <div className="h-12 w-6 rounded-full border-2 border-off-white/40 p-1">
          <div className="h-2.5 w-full rounded-full bg-gold" />
        </div>
      </div>
    </section>
  );
}
