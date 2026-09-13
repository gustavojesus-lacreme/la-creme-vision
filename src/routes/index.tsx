import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { About } from "@/components/landing/About";
import { Services } from "@/components/landing/Services";
import { Barbers } from "@/components/landing/Barbers";
import { Hours } from "@/components/landing/Hours";
import { Contact } from "@/components/landing/Contact";
import { Footer } from "@/components/landing/Footer";
import heroImage from "@/assets/hero-barbershop.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LA CREME BARBER | Barbearia Premium" },
      {
        name: "description",
        content:
          "LA CREME BARBER - Experiência premium de cuidado masculino. Cortes modernos, barba desenhada e atendimento de alto padrão. Agende seu horário.",
      },
      { property: "og:title", content: "LA CREME BARBER | Barbearia Premium" },
      {
        property: "og:description",
        content:
          "Experiência premium de cuidado masculino. Cortes modernos, barba desenhada e atendimento de alto padrão.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: heroImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "LA CREME BARBER | Barbearia Premium" },
      {
        name: "twitter:description",
        content:
          "Experiência premium de cuidado masculino. Cortes modernos, barba desenhada e atendimento de alto padrão.",
      },
      { name: "twitter:image", content: heroImage },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <About />
        <Services />
        <Barbers />
        <Hours />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
