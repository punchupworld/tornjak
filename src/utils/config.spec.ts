import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config";
import {
  buildTargetUrl,
  findMatchingConfig,
  getProxyMode,
  readConfigsFromDirectory,
} from "./config";

describe("readConfigsFromDirectory", () => {
  test("reads and validates all yaml configs in a directory", async () => {
    const configs = await readConfigsFromDirectory("mocks/configs");

    expect(configs).toHaveLength(2);

    expect(configs.map((config) => config.slug).sort()).toEqual(["admin-proxy", "app-proxy"]);

    const appProxy = configs.find((config) => config.slug === "app-proxy");
    const adminProxy = configs.find((config) => config.slug === "admin-proxy");

    expect(appProxy).toMatchObject({
      destinationUrl: "https://example.com",
      defaultMode: "bypass",
      turnstileSecret: "secret-basic",
      headers: {
        "x-powered-by": "tornjak",
        "x-env": "test",
      },
    });

    expect(appProxy?.routes).toEqual([
      {
        methods: "GET",
        path: ["/api/*"],
        mode: "bypass",
      },
      {
        methods: "POST",
        path: ["/auth/*"],
        mode: "turnstile",
      },
    ]);

    expect(adminProxy).toMatchObject({
      destinationUrl: "https://admin.example.com",
      defaultMode: "block",
      turnstileSecret: "secret-admin",
      headers: {
        "x-powered-by": "tornjak",
        "x-env": "staging",
      },
    });

    expect(adminProxy?.routes).toEqual([
      {
        methods: "PUT",
        path: ["/admin/*", "/settings/*"],
        mode: "block",
      },
      {
        methods: "PATCH",
        path: ["/admin/users/*"],
        mode: "turnstile",
      },
    ]);
  });

  test("throws when a turnstile route is missing turnstileSecret", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tornjak-config-"));
    await writeFile(
      join(directory, "invalid.yaml"),
      [
        "slug: missing-secret",
        "destinationUrl: https://example.com",
        "headers: {}",
        "routes:",
        "  - methods: GET",
        "    path:",
        "      - /secure/*",
        "    mode: turnstile",
        "",
      ].join("\n"),
    );

    await expect(readConfigsFromDirectory(directory)).rejects.toThrow(
      "turnstileSecret is required when any route uses turnstile mode",
    );
  });
});

describe("proxy helpers", () => {
  const appProxyConfig: Config = {
    slug: "app-proxy",
    destinationUrl: "https://example.com/base/",
    headers: {},
    defaultMode: "bypass",
    routes: [
      {
        path: ["/api/*"],
        mode: "bypass",
      },
    ],
  };

  const adminProxyConfig: Config = {
    slug: "app-proxy-admin",
    destinationUrl: "https://admin.example.com",
    headers: {},
    defaultMode: "block",
    routes: [
      {
        methods: "PATCH",
        path: ["/admin/*"],
        mode: "turnstile",
      },
    ],
  };

  const configs: Config[] = [appProxyConfig, adminProxyConfig];

  test("buildTargetUrl joins destination and request paths", () => {
    const target = buildTargetUrl(appProxyConfig, "/users/42", "?foo=bar");

    expect(target.toString()).toBe("https://example.com/base/users/42?foo=bar");
  });

  test("findMatchingConfig prefers the longest matching slug", () => {
    expect(findMatchingConfig(configs, "/app-proxy-admin/settings")).toEqual(adminProxyConfig);
  });

  test("getProxyMode returns the matched route mode or the default", () => {
    expect(getProxyMode(appProxyConfig, "/api/health", "GET")).toBe("bypass");
    expect(getProxyMode(appProxyConfig, "/other", "GET")).toBe("bypass");
    expect(getProxyMode(adminProxyConfig, "/admin/users", "PATCH")).toBe("turnstile");
    expect(getProxyMode(adminProxyConfig, "/admin/users", "GET")).toBe("block");
  });
});
