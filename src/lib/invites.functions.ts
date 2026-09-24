import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function loadInvite(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("barber_invites")
    .select("id, barber_id, expires_at, used_at, barbers(name, user_id)")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date() || data.barbers?.user_id) return null;
  return { supabaseAdmin, invite: data };
}

export const getBarberInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const r = await loadInvite(data.token);
    return r ? { barberName: r.invite.barbers?.name ?? "" } : null;
  });

export const acceptBarberInvite = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: z.string().uuid(), email: z.string().email().max(255), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const r = await loadInvite(data.token);
    if (!r) return { ok: false as const, error: "Convite inválido, expirado ou já utilizado." };
    const { supabaseAdmin, invite } = r;
    const name = invite.barbers?.name ?? "";
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { first_name: name.split(" ")[0] ?? "", last_name: name.split(" ").slice(1).join(" ") },
    });
    if (error || !created.user) {
      const msg = error?.message.toLowerCase() ?? "";
      if (msg.includes("already")) return { ok: false as const, error: "Este e-mail já possui cadastro. Use outro e-mail." };
      if (msg.includes("password")) return { ok: false as const, error: "Senha fraca. Use uma senha mais forte." };
      return { ok: false as const, error: "Não foi possível criar o acesso." };
    }
    const uid = created.user.id;
    await supabaseAdmin.from("barbers").update({ user_id: uid }).eq("id", invite.barber_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "barbeiro" });
    await supabaseAdmin.from("barber_invites").update({ used_at: new Date().toISOString() }).eq("id", invite.id);
    return { ok: true as const };
  });
