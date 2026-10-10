import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  return data === true;
}

export type ClientRow = {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
  code: number | null;
  appointments: number;
  archived: boolean;
};

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientRow[]> => {
    if (!(await assertAdmin(context))) throw new Error("forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }, { data: appts }, users, { data: codes }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, first_name, last_name, whatsapp, archived_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("appointments").select("user_id").not("user_id", "is", null),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from("clients").select("profile_id, code").not("profile_id", "is", null),
    ]);
    const codeMap = new Map((codes ?? []).map((c) => [c.profile_id!, c.code]));
    const staff = new Set((roles ?? []).filter((r) => r.role !== "user").map((r) => r.user_id));
    const emails = new Map((users.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    const counts = new Map<string, number>();
    for (const a of appts ?? []) counts.set(a.user_id!, (counts.get(a.user_id!) ?? 0) + 1);
    return (profiles ?? [])
      .filter((p) => !staff.has(p.id))
      .map((p) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim() || "Sem nome",
        whatsapp: p.whatsapp,
        email: emails.get(p.id) ?? "",
        code: codeMap.get(p.id) ?? null,
        appointments: counts.get(p.id) ?? 0,
        archived: !!p.archived_at,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });

// Permanently removes a client: appointments, profile, roles and login.
export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await assertAdmin(context))) return { ok: false as const, error: "Somente o administrador pode excluir clientes." };
    if (data.clientId === context.userId) return { ok: false as const, error: "Você não pode excluir a própria conta." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.clientId);
    if (roles?.some((r) => r.role !== "user")) return { ok: false as const, error: "Esta conta não é de cliente." };
    const { error: aErr } = await supabaseAdmin.from("appointments").delete().eq("user_id", data.clientId);
    if (aErr) return { ok: false as const, error: "Não foi possível excluir os agendamentos do cliente." };
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.clientId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.clientId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.clientId);
    if (error) return { ok: false as const, error: "Não foi possível excluir a conta." };
    return { ok: true as const };
  });

export const restoreClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await assertAdmin(context))) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ archived_at: null }).eq("id", data.clientId);
    await supabaseAdmin.auth.admin.updateUserById(data.clientId, { ban_duration: "none" });
    return { ok: true as const };
  });

export type ClientDetail = {
  id: string;
  first_name: string;
  last_name: string;
  whatsapp: string;
  email: string;
  code: number | null;
  created_at: string;
  archived: boolean;
  appointments: { id: string; starts_at: string; status: string; services_label: string; total_price_cents: number | null; barber: string }[];
};

// Full registration card of one client (admin only).
export const getClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ClientDetail | null> => {
    if (!(await assertAdmin(context))) throw new Error("forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: p }, u, { data: c }, { data: appts }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, first_name, last_name, whatsapp, created_at, archived_at").eq("id", data.clientId).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.clientId),
      supabaseAdmin.from("clients").select("code").eq("profile_id", data.clientId).maybeSingle(),
      supabaseAdmin.from("appointments").select("id, starts_at, status, services_label, total_price_cents, barbers(name)").eq("user_id", data.clientId).order("starts_at", { ascending: false }).limit(50),
    ]);
    if (!p) return null;
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      whatsapp: p.whatsapp,
      email: u.data.user?.email ?? "",
      code: c?.code ?? null,
      created_at: p.created_at,
      archived: !!p.archived_at,
      appointments: (appts ?? []).map((a: any) => ({ id: a.id, starts_at: a.starts_at, status: a.status, services_label: a.services_label, total_price_cents: a.total_price_cents, barber: a.barbers?.name ?? "" })),
    };
  });
