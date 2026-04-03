import { Glob, YAML } from "bun";
import z from "zod";

const proxyModeSchema = z.enum(["bypass", "block", "turnstile"]);

const routeSchema = z.object({
  methods: z
    .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
    .optional()
    .describe("HTTP methods to match"),
  path: z.array(z.string()).describe("List of glob patterns to match request path"),
  mode: proxyModeSchema.describe("Proxy mode for this route"),
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
