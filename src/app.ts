import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import z from "zod";
import { httpMethodSchema, type Config } from "./utils/config/schema";
import { handleRequest, type TurnstileCache } from "./utils/request";
import { serializeResponses } from "./utils/response";

export const createApp = (configs: Config[]) =>
  new Elysia()
    .state({ configs })
    .use(cors())
    .get("/", () => ({ status: "Torkjak is running 🐶" }))
    .post(
      "/batch/:slug",
      async ({ body, params, request, store, server }) => {
        const turnstileCache: TurnstileCache = new Map();

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
              turnstileCache,
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
