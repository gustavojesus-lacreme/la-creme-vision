import { supabase } from "@/integrations/supabase/client";

export type PanelAccess =
  | { role: "admin" }
  | { role: "barbeiro"; barberId: string }
  | { role: "barbeiro_pendente"; reason: "aguardando" | "desativado" }
  | null;

export async function getPanelAccess(): Promise<PanelAccess> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !roles) return null;

  if (roles.some((r) => r.role === "admin")) return { role: "admin" };

  if (roles.some((r) => r.role === "barbeiro")) {
    const { data: barber } = await supabase
      .from("barbers")
      .select("id, active, approved_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (barber?.approved_at && barber.active) return { role: "barbeiro", barberId: barber.id };
    if (barber) return { role: "barbeiro_pendente", reason: barber.approved_at ? "desativado" : "aguardando" };
  }

  return null;
}

export async function isBarberAdmin(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return false;
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return data != null;
}
