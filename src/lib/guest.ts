import { supabase } from "@/integrations/supabase/client";

export type GuestData = {
  firstName: string;
  lastName: string;
  whatsapp: string;
};

const KEY = "lacreme_guest";

// Modo visitante controlado pelo admin em Configurações → Regras de agendamento.
export async function fetchGuestBookingEnabled(): Promise<boolean> {
  const { data } = await supabase.rpc("guest_booking_enabled");
  return data === true;
}

export function readGuest(): GuestData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GuestData) : null;
  } catch {
    return null;
  }
}

export function saveGuest(data: GuestData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(data));
}

export function clearGuest() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/** WhatsApp brasileiro real: DDD válido + 9 dígitos, sem sequências fictícias. */
export function isValidBrWhatsapp(value: string): boolean {
  let d = value.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11) return false;
  if (d[0] === "0" || d[1] === "0" || d[2] !== "9") return false;
  const n = d.slice(3);
  if (/^(\d)\1+$/.test(n) || /(\d)\1{4,}/.test(n)) return false;
  if (n === "12345678" || n === "87654321") return false;
  return true;
}
