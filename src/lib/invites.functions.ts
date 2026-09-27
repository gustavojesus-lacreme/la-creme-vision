import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function loadInvite(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("barber_invites")
    .select("id, barber_id, expires_at, used_at, barbers(name, last_name, whatsapp, user_id, archived_at)")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.barbers?.archived_at) return { status: "invalid" as const };
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

// Confirms that the person owns an existing account (e.g. a client account) by checking the password.
async function verifyExistingAccount(email: string, password: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  await client.auth.signOut().catch(() => {});
  return data.user.id;
}

export const acceptBarberInvite = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: z.string().uuid(), email: z.string().trim().email().max(255), password: z.string().min(6).max(72) }).parse(d),
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
    const whatsapp = (invite.barbers?.whatsapp ?? "").trim();

    let uid: string | null = null;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { first_name: first, last_name: last, whatsapp },
    });
    if (created?.user) {
      uid = created.user.id;
    } else {
      const msg = error?.message.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        // Existing account (usually a client): link it instead of creating a duplicate.
        uid = await verifyExistingAccount(data.email, data.password);
        if (!uid) {
          await release();
          return {
            ok: false as const,
            error: "Este e-mail já possui cadastro. Digite a senha atual dessa conta nos dois campos para vinculá-la ao seu acesso de barbeiro.",
          };
        }
        const { data: other } = await supabaseAdmin.from("barbers").select("id").eq("user_id", uid).neq("id", invite.barber_id).maybeSingle();
        if (other) {
          await release();
          return { ok: false as const, error: "Esta conta já está vinculada a outro barbeiro." };
        }
      } else {
        await release();
        if (msg.includes("password")) return { ok: false as const, error: "Senha fraca. Use uma senha mais forte." };
        return { ok: false as const, error: "Não foi possível ativar o acesso." };
      }
    }

    const { error: linkErr } = await supabaseAdmin
      .from("barbers")
      .update({ user_id: uid, email: data.email, active: true })
      .eq("id", invite.barber_id);
    if (linkErr) {
      await release();
      return { ok: false as const, error: "Não foi possível vincular a conta ao barbeiro." };
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: "barbeiro" }, { onConflict: "user_id,role" });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid).eq("role", "user");
    // Keep the account's profile in sync with the barber profile created by the admin.
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, first_name: first, last_name: last, ...(whatsapp ? { whatsapp } : {}), archived_at: null }, { onConflict: "id" });
    await supabaseAdmin.auth.admin.updateUserById(uid, { ban_duration: "none" });
    // Invalidate any other pending links for this barber.
    await supabaseAdmin.from("barber_invites").delete().eq("barber_id", invite.barber_id).is("used_at", null);
    return { ok: true as const };
  });

// Permanently removes a barber, their appointments, invites and barber access.
export const deleteBarber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ barberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false as const, error: "Somente o administrador pode excluir barbeiros." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: barber } = await supabaseAdmin.from("barbers").select("user_id").eq("id", data.barberId).maybeSingle();
    if (!barber) return { ok: false as const, error: "Barbeiro não encontrado." };
    await supabaseAdmin.from("barber_invites").delete().eq("barber_id", data.barberId);
    const { error: apptErr } = await supabaseAdmin.from("appointments").delete().eq("barber_id", data.barberId);
    if (apptErr) return { ok: false as const, error: "Não foi possível excluir os agendamentos do barbeiro." };
    const { error } = await supabaseAdmin.from("barbers").delete().eq("id", data.barberId);
    if (error) return { ok: false as const, error: "Não foi possível excluir." };
    const uid = barber.user_id;
    if (uid) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid).eq("role", "barbeiro");
      const { data: rest } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", uid);
      // A login that was only for this barber is removed too; an admin keeps their account.
      if (!rest?.some((r) => r.role === "admin") && uid !== context.userId) {
        const { count } = await supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }).eq("user_id", uid);
        if ((count ?? 0) > 0) await supabaseAdmin.from("appointments").delete().eq("user_id", uid);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
        await supabaseAdmin.from("profiles").delete().eq("id", uid);
        await supabaseAdmin.auth.admin.deleteUser(uid);
      }
    }
    return { ok: true as const };
  });
