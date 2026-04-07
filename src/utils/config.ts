import { Glob, YAML } from "bun";
import { join } from "node:path";
import z from "zod";

const httpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]);
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

const configSchema = z
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

export async function readConfigsFromDirectory(directory: string): Promise<Config[]> {
  const glob = new Glob("**/*.{yml,yaml}");
  const configs: Config[] = [];

  for await (const path of glob.scan({ cwd: directory, absolute: true })) {
    const content = await Bun.file(path).text();
    const parsed = YAML.parse(content);
    configs.push(configSchema.parse(parsed));
  }

  return configs;
}

export function formatConfigsSummary(configs: ReadonlyArray<Config>) {
  const countLabel = configs.length === 1 ? "config" : "configs";

  if (configs.length === 0) {
    return `Loaded 0 ${countLabel}: none`;
  }

  return [
    `Loaded ${configs.length} ${countLabel}:`,
    ...configs.map(
      (config) =>
        `- ${config.slug} | destination: ${config.destinationUrl} | routes: ${formatRouteSummary(config.routes)}`,
    ),
  ].join("\n");
}

function formatRouteSummary(routes: Config["routes"]) {
  const routeModes = [...new Set(routes.map((route) => route.mode))];

  return `${routes.length} ${routes.length === 1 ? "route" : "routes"}${routeModes.length > 0 ? ` (${routeModes.join(", ")})` : ""}`;
}

export function buildTargetUrl(config: Config, pathname: string, search: string) {
  const target = new URL(config.destinationUrl);
  target.pathname = join(target.pathname, pathname);
  target.search = search;

  return target;
}

export function findMatchingConfig(configs: Config[], pathname: string) {
  return [...configs]
    .sort((left, right) => right.slug.length - left.slug.length)
    .find((config) => pathname === `/${config.slug}` || pathname.startsWith(`/${config.slug}/`));
}

export function getProxyMode(config: Config, pathname: string, method: string): ProxyMode {
  return (
    config.routes.find(
      (route) =>
        (route.methods === undefined || route.methods.includes(method as HttpMethod)) &&
        (route.paths === undefined ||
          route.paths.some((pattern) => new Bun.Glob(pattern).match(pathname))),
    )?.mode ?? config.defaultMode
  );
}
