import type { Config } from "./config/schema";
import { buildTargetUrl, findMatchingConfig, getProxyMode } from "./config/helpers";
import { TURNSTILE_TOKEN_HEADER, validateTurnstile } from "./turnstile";

export type TurnstileCache = Map<string, Promise<{ success: boolean; error?: unknown }>>;

export async function handleRequest(
  request: Request,
  configs: Config[],
  server:
    | { requestIP(request: Request): { address: string; family: string; port: number } | null }
    | null
    | undefined,
  turnstileCache: TurnstileCache = new Map(),
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const config = findMatchingConfig(configs, pathname);

  if (config === undefined) {
    return new Response("Not found", { status: 404 });
  }

  const slugPrefix = `/${config.slug}`;
  const relativePath = pathname.slice(slugPrefix.length) || "/";
  const mode = getProxyMode(config, relativePath, request.method);

  if (mode === "block") {
    return new Response("Forbidden", { status: 403 });
  }

  if (mode === "turnstile") {
    const token = request.headers.get(TURNSTILE_TOKEN_HEADER)?.trim();

    if (!token) {
      return new Response("Turnstile token required", { status: 422 });
    }

    const remoteip =
      request.headers.get("cf-connecting-ip") ?? server?.requestIP(request)?.address ?? "";
    const cacheKey = `${config.turnstileSecret ?? ""}:${token}:${remoteip}`;

    let resultPromise = turnstileCache.get(cacheKey);
    if (!resultPromise) {
      resultPromise = validateTurnstile(config.turnstileSecret ?? "", token, remoteip);
      turnstileCache.set(cacheKey, resultPromise);
    }

    const result = await resultPromise;

    if (!result.success) {
      return new Response(
        result.error === undefined ? "Turnstile validation failed" : "Turnstile unavailable",
        { status: result.error === undefined ? 403 : 502 },
      );
    }
  }

  return proxyRequest(request, config, relativePath);
}

async function proxyRequest(request: Request, config: Config, pathname: string) {
  const targetUrl = buildTargetUrl(config, pathname, new URL(request.url).search);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("content-length");

  for (const [name, value] of Object.entries(config.headers)) {
    headers.set(name, value);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.clone().arrayBuffer();
  }

  return fetch(targetUrl, init);
}
