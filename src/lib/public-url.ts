// Official public address of the app (custom domain). Printed QR codes and
// invite links always use it, regardless of where the admin screen is opened.
export const PUBLISHED_APP_URL = "https://lacremebarber.com.br";

export function publicAppOrigin() {
  return PUBLISHED_APP_URL;
}
