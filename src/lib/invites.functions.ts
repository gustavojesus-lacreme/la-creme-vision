import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function loadInvite(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("barber_invites")
    .select("id, barber_id, expires_at, used_at, barbers(name, last_name, user_id)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return { status: "invalid" as const };
  if (data.used_at || data.barbers?.user_id) return { status: "used" as const };
  if (new Date(data.expires_at) < new Date()) return { status: "expired" as const };
  return { status: "ok" as const, supabaseAdmin, invite: data };
}

export const getBarberInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const r = await loadInvite(data.token);
    if (r.status !== "ok") return { status: r.status, barberName: "" };
    return { status: "ok" as const, barberName: r.invite.barbers?.name ?? "" };
  });

export const acceptBarberInvite = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: z.string().uuid(), email: z.string().trim().email().max(255), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const r = await loadInvite(data.token);
    if (r.status === "used") return { ok: false as const, error: "Este link já foi utilizado. Peça um novo ao administrador." };
    if (r.status === "expired") return { ok: false as const, error: "Este link expirou. Peça um novo ao administrador." };
    if (r.status !== "ok") return { ok: false as const, error: "Link de ativação inválido." };
    const { supabaseAdmin, invite } = r;

    // Consume the link atomically first so it can never be used twice.
    const { data: claimed } = await supabaseAdmin
      .from("barber_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id)
      .is("used_at", null)
      .select("id");
    if (!claimed?.length) return { ok: false as const, error: "Este link já foi utilizado." };
    const release = () => supabaseAdmin.from("barber_invites").update({ used_at: null }).eq("id", invite.id);

    const full = invite.barbers?.name ?? "";
    const last = invite.barbers?.last_name ?? "";
    const first = last && full.endsWith(last) ? full.slice(0, -last.length).trim() : full;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { first_name: first, last_name: last },
    });
    if (error || !created.user) {
      await release();
      const msg = error?.message.toLowerCase() ?? "";
      if (msg.includes("already")) return { ok: false as const, error: "Este e-mail já possui cadastro. Use outro e-mail." };
      if (msg.includes("password")) return { ok: false as const, error: "Senha fraca. Use uma senha mais forte." };
      return { ok: false as const, error: "Não foi possível ativar o acesso." };
    }
    const uid = created.user.id;
    await supabaseAdmin.from("barbers").update({ user_id: uid, email: data.email }).eq("id", invite.barber_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid).eq("role", "user");
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "barbeiro" });
    // Invalidate any other pending links for this barber.
    await supabaseAdmin.from("barber_invites").delete().eq("barber_id", invite.barber_id).is("used_at", null);
    return { ok: true as const };
  });
