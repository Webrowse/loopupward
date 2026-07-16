export const dynamic = "force-dynamic";

/**
 * Which country is this request from? Cloudflare stamps CF-IPCountry on
 * every request it proxies (the frontend worker always sits behind it in
 * production), so this costs nothing and needs no geo database. Locally
 * there's no Cloudflare and the header is absent — callers fall back to
 * a timezone guess. "XX"/"T1" are Cloudflare's unknown/Tor markers.
 */
export async function GET(req: Request) {
  const raw = req.headers.get("cf-ipcountry");
  const country = raw && raw !== "XX" && raw !== "T1" ? raw.toUpperCase() : null;
  return Response.json({ country });
}
