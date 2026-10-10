import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/app/AppNav";
import { ClientDetailDialog } from "@/components/app/ClientDetailDialog";
import { isBarberAdmin } from "@/lib/admin";
import { deleteClient, listClients, restoreClient, type ClientRow } from "@/lib/clients.functions";

export const Route = createFileRoute("/_authenticated/admin-clientes")({
  validateSearch: (s: Record<string, unknown>): { cliente?: string } =>
    typeof s['cliente'] === "string" ? { cliente: s['cliente'] as string } : {},
  head: () => ({
    meta: [
      { title: "Clientes | LA CREME BARBER" },
      { name: "description", content: "Gerencie os clientes cadastrados." },
      { property: "og:title", content: "Clientes | LA CREME BARBER" },
      { property: "og:description", content: "Área administrativa de clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminClientsPage,
});

const card = "rounded-lg border border-border bg-card p-4";
const btnOutline = "min-h-12 rounded-md border border-input px-3 text-sm font-semibold text-foreground disabled:opacity-50";

function AdminClientsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listClients);
  const del = useServerFn(deleteClient);
  const restore = useServerFn(restoreClient);
  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: isBarberAdmin });
  const isAdmin = adminQuery.data === true;
  const clientsQuery = useQuery({ queryKey: ["admin-clients"], enabled: isAdmin, queryFn: () => list() });
  const [confirm, setConfirm] = useState<ClientRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { cliente } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [openId, setOpenIdState] = useState<string | null>(cliente ?? null);
  const setOpenId = (id: string | null) => { setOpenIdState(id); if (!id && cliente) navigate({ search: {}, replace: true }); };

  async function doDelete(c: ClientRow) {
    const res = await del({ data: { clientId: c.id } }).catch(() => ({ ok: false as const, error: "Não foi possível excluir." }));
    setConfirm(null);
    setMsg(res.ok ? `${c.name} foi excluído definitivamente.` : res.error);
    qc.invalidateQueries({ queryKey: ["admin-clients"] });
  }
  async function doRestore(c: ClientRow) {
    await restore({ data: { clientId: c.id } }).catch(() => {});
    setMsg(`${c.name} foi reativado.`);
    qc.invalidateQueries({ queryKey: ["admin-clients"] });
  }

  const active = clientsQuery.data?.filter((c) => !c.archived) ?? [];
  const archived = clientsQuery.data?.filter((c) => c.archived) ?? [];

  const row = (c: ClientRow) => (
    <div key={c.id} className={card}>
      <button type="button" onClick={() => setOpenId(c.id)} className="block w-full min-w-0 text-left">
        <p className="text-base font-bold text-card-foreground">{c.name}</p>
        {c.code != null && <p className="text-sm text-foreground/70">Código: #{String(c.code).padStart(5, "0")}</p>}
        {c.whatsapp && <p className="text-sm text-foreground/70">{c.whatsapp}</p>}
        {c.email && <p className="truncate text-sm text-foreground/70">{c.email}</p>}
        <p className="mt-1 text-sm text-foreground/70">{c.appointments} agendamento(s)</p>
        <p className="mt-1 text-sm font-semibold text-brand">Ver ficha</p>
      </button>
      <div className="mt-3">
        {c.archived ? (
          <button className={btnOutline} onClick={() => doRestore(c)}>Reativar cliente</button>
        ) : (
          <button className={`${btnOutline} text-destructive`} onClick={() => { setMsg(null); setConfirm(c); }}>Excluir cliente</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-svh bg-background">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Clientes</h1>
        {adminQuery.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
        {adminQuery.data === false && (
          <div className={`${card} text-center`}><p className="text-base text-foreground/80">Acesso restrito ao administrador.</p></div>
        )}
        {isAdmin && (
          <>
            {msg && <div className={`${card} text-sm font-semibold text-foreground`}>{msg}</div>}
            {clientsQuery.isLoading && <p className="text-base text-foreground/70">Carregando...</p>}
            <h2 className="text-lg font-bold text-foreground">Clientes ativos ({active.length})</h2>
            <div className="grid gap-3">{active.map(row)}</div>
            {archived.length > 0 && (
              <>
                <h2 className="pt-2 text-lg font-bold text-foreground">Clientes arquivados ({archived.length})</h2>
                <div className="grid gap-3">{archived.map(row)}</div>
              </>
            )}
          </>
        )}
        {openId && isAdmin && <ClientDetailDialog clientId={openId} onClose={() => setOpenId(null)} />}
        {confirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
            <div className={`${card} w-full max-w-sm space-y-3`}>
              <p className="text-base font-bold text-card-foreground">Excluir este cliente definitivamente?</p>
              <p className="text-sm text-foreground/80">
                {confirm.name}: o cadastro, a conta de acesso e os agendamentos dele serão removidos. Esta ação não poderá ser desfeita.
              </p>
              <div className="flex gap-2">
                <button className="min-h-12 flex-1 rounded-md bg-destructive px-4 text-base font-bold text-destructive-foreground" onClick={() => doDelete(confirm)}>Excluir definitivamente</button>
                <button className={`${btnOutline} flex-1`} onClick={() => setConfirm(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
