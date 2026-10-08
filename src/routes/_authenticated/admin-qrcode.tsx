import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { AppNav } from "@/components/app/AppNav";
import { isBarberAdmin } from "@/lib/admin";
import { PUBLISHED_APP_URL } from "@/lib/public-url";

export const Route = createFileRoute("/_authenticated/admin-qrcode")({
  head: () => ({
    meta: [
      { title: "QR Code para clientes | LA CREME BARBER" },
      { name: "description", content: "QR Code oficial de agendamento da LA CREME BARBER." },
      { property: "og:title", content: "QR Code para clientes | LA CREME BARBER" },
      { property: "og:description", content: "Link oficial de agendamento para imprimir." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QrPage,
});

const card = "rounded-lg border border-border bg-card p-4";
const btnPrimary = "min-h-12 rounded-md bg-brand px-4 text-base font-bold text-brand-foreground disabled:opacity-50";
const btnOutline = "min-h-12 rounded-md border border-input px-3 text-sm font-semibold text-foreground";

function QrPage() {
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(PUBLISHED_APP_URL, { width: 1024, margin: 2 }).then(setQr).catch(() => {});
  }, []);

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">QR Code para clientes</h1>
        {adminQuery.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {adminQuery.data === false && (
          <div className={`${card} text-center`}><p className="text-base text-foreground/80">Acesso restrito ao administrador.</p></div>
        )}
        {adminQuery.data === true && (
          <div className={`${card} space-y-3 text-center`}>
            <p className="text-sm text-foreground/70">
              Endereço oficial e fixo. Pode imprimir: ele não muda quando o aplicativo for atualizado.
            </p>
            {qr && <img src={qr} alt="QR Code oficial da LA CREME BARBER" className="mx-auto w-full max-w-72 rounded-md bg-background" />}
            <p className="break-all text-base font-semibold text-brand">{PUBLISHED_APP_URL}</p>
            <div className="grid grid-cols-2 gap-2">
              {qr ? (
                <a className={`${btnPrimary} flex items-center justify-center`} href={qr} download="qrcode-lacreme-barber.png">Baixar QR Code</a>
              ) : (
                <button disabled className={btnPrimary}>Baixar QR Code</button>
              )}
              <button className={btnOutline} onClick={() => { navigator.clipboard?.writeText(PUBLISHED_APP_URL).catch(() => {}); setCopied(true); }}>
                {copied ? "Endereço copiado" : "Copiar endereço"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
