// Pure, runtime-agnostic (edge + node) auth token derived from the shared password.
// The cookie holds this token; the proxy recomputes it to validate — an attacker
// who doesn't know the password can't produce it.
export const AUTH_COOKIE = "milester_auth";

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`milester-auth:v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
