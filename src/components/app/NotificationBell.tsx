import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function NotificationBell({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["notif-unread", userId],
    refetchInterval: 60000,
    queryFn: async () =>
      (await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null)).count ?? 0,
  });
  const n = q.data ?? 0;
  return (
    <Link to="/notificacoes" aria-label={n ? `Notificações: ${n} não lidas` : "Notificações"}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent">
      <Bell className="h-5 w-5" />
      {n > 0 && (
        <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-sidebar-foreground px-1 text-[11px] font-bold text-sidebar">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
