/**
 * Helper voor de beveiligde Netlify Functions (/api/shopify-*).
 * Het geheim wordt bij het inloggen opgeslagen (zie LoginScreen) en als
 * `Authorization: Bearer <geheim>` meegestuurd. De functions checken dit tegen
 * de Netlify env var API_SECRET; zonder correcte header antwoorden ze met 401.
 */
export function getApiSecret(): string {
  return sessionStorage.getItem('moevs-secret') || '';
}

/** Bouwt de headers voor een beveiligde /api call, optioneel gemerged met extra headers. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const secret = getApiSecret();
  return {
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    ...(extra || {}),
  };
}
