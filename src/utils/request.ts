import type { Context } from "elysia";
import type { Config } from "./config/schema";
import { buildTargetUrl, getProxyMode } from "./config/helpers";
import {
  TURNSTILE_TOKEN_HEADER,
  TURNSTILE_CACHE_MS_HEADER,
  validateTurnstile,
  type TurnstileSessionCache,
} from "./turnstile";

export async function handleRequest({
  request,
  config,
  server = null,
  sessionCache = new Map(),
}: {
  request: Request;
  config: Config;
  server?: Context["server"];
  sessionCache?: TurnstileSessionCache;
}): Promise<Response> {
  const pathname = new URL(request.url).pathname;

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

    const result = await validateTurnstile({
      token,
      sessionCache,
      secret: config.turnstileSecret,
      remoteip: request.headers.get("cf-connecting-ip") ?? server?.requestIP(request)?.address,
      cacheHeader: request.headers.get(TURNSTILE_CACHE_MS_HEADER),
    });

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
  headers.delete(TURNSTILE_CACHE_MS_HEADER);

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
