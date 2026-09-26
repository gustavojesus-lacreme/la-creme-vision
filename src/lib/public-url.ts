// Stable public address of the published app. Preview addresses require
// Lovable project access, so invite links must never point to them.
export const PUBLISHED_APP_URL = "https://project--d0b061f7-31d4-495b-9d1c-103675ae49d8.lovable.app";

export function publicAppOrigin() {
  if (typeof window === "undefined") return PUBLISHED_APP_URL;
  const { origin, hostname } = window.location;
  const isInternal =
    hostname.includes("id-preview--") ||
    hostname.endsWith("lovableproject.com") ||
    hostname.includes("-dev.lovable.app") ||
    hostname === "localhost";
  return isInternal ? PUBLISHED_APP_URL : origin;
}
