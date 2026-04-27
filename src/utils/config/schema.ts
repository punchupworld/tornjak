import z from "zod";

export const httpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]);
const proxyModeSchema = z.enum(["bypass", "block", "turnstile"]);

export type HttpMethod = z.infer<typeof httpMethodSchema>;
export type ProxyMode = z.infer<typeof proxyModeSchema>;

const routeSchema = z
  .object({
    methods: z.array(httpMethodSchema).optional().describe("HTTP methods to match"),
    paths: z.array(z.string()).optional().describe("List of glob patterns to match request path"),
    mode: proxyModeSchema.describe("Proxy mode for this route"),
  })
  .superRefine((route, ctx) => {
    if (route.methods === undefined && route.paths === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: "methods or paths is required for each route",
      });
    }
  });

export const configSchema = z
  .object({
    slug: z.string().describe("Slug for the proxy, used in the URL path"),
    destinationUrl: z.string().describe("Base URL to which requests will be proxied"),
    headers: z
      .record(z.string(), z.string())
      .default({})
      .describe("Headers to add to proxied requests"),
    turnstileSecret: z.string().optional().describe("Secret key for Turnstile validation"),
    defaultMode: proxyModeSchema
      .default("bypass")
      .describe("Default proxy mode for requests that don't match any route"),
    routes: z.array(routeSchema).describe("List of routes to proxy"),
  })
  .superRefine((config, ctx) => {
    const hasTurnstileRoute = config.routes.some((route) => route.mode === "turnstile");

    if (hasTurnstileRoute && config.turnstileSecret === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["turnstileSecret"],
        message: "turnstileSecret is required when any route uses turnstile mode",
      });
    }
  });

export type Config = z.infer<typeof configSchema>;
