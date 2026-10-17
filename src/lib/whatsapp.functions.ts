import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listWhatsappConfirmations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || role.data !== true) throw new Error("Acesso restrito ao administrador.");
    const result = await context.supabase.from("whatsapp_outbound_messages")
      .select("id, appointment_id, state, blocked_reason, attempts, last_attempt_at, error_code, created_at, appointments(customer_first_name, customer_last_name, starts_at, services_label)")
      .order("created_at", { ascending: false }).limit(50);
    if (result.error) throw new Error("Não foi possível consultar as confirmações.");
    return { active: false, messages: result.data ?? [] };
  });