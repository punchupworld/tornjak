import { Glob, YAML } from "bun";
import { join } from "node:path";
import { ZodError } from "zod";

import type { Config, HttpMethod, ProxyMode } from "./schema";
import { configSchema } from "./schema";

export async function readConfigsFromDirectory(directory: string): Promise<Config[]> {
  const glob = new Glob("**/*.{yml,yaml}");
  const configs: Config[] = [];

  for await (const path of glob.scan({ cwd: directory, absolute: true })) {
    try {
      const content = await Bun.file(path).text();
      const parsed = YAML.parse(content);
      configs.push(configSchema.parse(parsed));
    } catch (error) {
      console.error(`Failed to load config ${path}: ${formatErrorMessage(error)}`);
    }
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
        `${config.slug} | destination: ${config.destinationUrl} | routes: ${formatRouteSummary(config.routes)}`,
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

function formatErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}
