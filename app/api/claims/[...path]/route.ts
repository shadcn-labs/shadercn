/**
 * Same-origin proxy for claim traffic.
 *
 * The browser talks to /api/claims/* on the Next.js origin; this route
 * forwards to the separately deployed Cloudflare Worker (CLAIMS_WORKER_URL)
 * so D1/Email credentials never reach the client. Production claim traffic
 * executes in the Worker runtime.
 */

const workerBase = () =>
  (process.env.CLAIMS_WORKER_URL ?? "").replace(/\/$/, "");

const passthroughHeaders = (request: Request): Headers => {
  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const ip =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("CF-Connecting-IP");
  if (ip) {
    headers.set("X-Forwarded-For", ip);
  }
  const origin = request.headers.get("Origin");
  if (origin) {
    headers.set("Origin", origin);
  }
  const referer = request.headers.get("Referer");
  if (referer) {
    headers.set("Referer", referer);
  }
  return headers;
};

const proxy = async (
  request: Request,
  context: { params: Promise<{ path?: string[] }> }
): Promise<Response> => {
  const base = workerBase();
  if (!base) {
    return Response.json(
      { code: "claims_unavailable", ok: false },
      { status: 503 }
    );
  }
  const { path } = await context.params;
  const suffix = (path ?? []).map(encodeURIComponent).join("/");
  const incoming = new URL(request.url);
  const target = `${base}/api/claims${suffix ? `/${suffix}` : ""}${incoming.search}`;
  const init: RequestInit = {
    body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    headers: passthroughHeaders(request),
    method: request.method,
    redirect: "manual",
  };
  const upstream = await fetch(target, init).catch(() => null);
  if (!upstream) {
    return Response.json({ code: "upstream", ok: false }, { status: 502 });
  }
  const body = await upstream.arrayBuffer();
  const headers = new Headers();
  const contentType = upstream.headers.get("Content-Type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  headers.set("Cache-Control", "no-store");
  return new Response(body, { headers, status: upstream.status });
};

export const GET = proxy;
export const POST = proxy;
