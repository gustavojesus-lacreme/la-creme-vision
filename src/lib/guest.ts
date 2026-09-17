export type GuestData = {
  firstName: string;
  lastName: string;
  whatsapp: string;
};

const KEY = "lacreme_guest";

export function readGuest(): GuestData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestData>;
    if (!parsed.firstName || !parsed.whatsapp) return null;
    return {
      firstName: parsed.firstName,
      lastName: parsed.lastName ?? "",
      whatsapp: parsed.whatsapp,
    };
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
