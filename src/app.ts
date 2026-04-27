import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import z from "zod";
import { httpMethodSchema, type Config } from "./utils/config/schema";
import { handleRequest } from "./utils/request";
import { serializeResponses } from "./utils/response";
import type { TurnstileSessionCache } from "./utils/turnstile";

export const createApp = (configs: Config[]) =>
  new Elysia()
    .state({ configs })
    .use(cors())
    .get("/", () => ({ status: "Torkjak is running 🐶" }))
    .post(
      "/batch/:slug",
      async ({ body, params, request, store, server, set }) => {
        const config = store.configs.find((c) => c.slug === params.slug);
        if (!config) {
          set.status = 404;
          return "Not found";
        }
        if (body.length > config.batchingLimit) {
          set.status = 413;
          return `Batch limit exceeded: max ${config.batchingLimit} requests allowed`;
        }

        const turnstileSessionCache: TurnstileSessionCache = new Map();

        const responses = await Promise.all(
          body.map(async (item) => {
            const reqInit: RequestInit = {};
            if (item.method) reqInit.method = item.method;
            if (item.body) {
              reqInit.body = typeof item.body === "string" ? item.body : JSON.stringify(item.body);
            }

            const headers = new Headers(request.headers);
            if (item.headers) {
              for (const [name, value] of Object.entries(item.headers)) {
                headers.set(name, value);
              }
            }
            reqInit.headers = headers;

            const path = item.path.startsWith("/") ? item.path : `/${item.path}`;
            const reqUrl = new URL(`/${params.slug}${path}`, request.url).href;

            return handleRequest(
              new Request(reqUrl, reqInit),
              store.configs,
              server,
              turnstileSessionCache,
            );
          }),
        );

        return serializeResponses(responses);
      },
      {
        body: z.array(
          z.object({
            path: z.string(),
            method: httpMethodSchema.optional(),
            headers: z.record(z.string(), z.string()).optional(),
            body: z.union([z.string(), z.json()]).optional(),
          }),
        ),
      },
    )
    .all("/:slug/*", async ({ request, store, server }) =>
      handleRequest(request, store.configs, server),
    );
