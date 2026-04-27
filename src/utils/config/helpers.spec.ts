import { describe, expect, spyOn, test } from "bun:test";

import type { Config } from "./schema";
import {
  buildTargetUrl,
  formatConfigsSummary,
  findMatchingConfig,
  getProxyMode,
  readConfigsFromDirectory,
} from "./helpers";

describe("formatConfigsSummary", () => {
  test("summarizes multiple configs by count and slug", () => {
    expect(
      formatConfigsSummary([
        {
          slug: "app-proxy",
          destinationUrl: "https://example.com",
          headers: {},
          defaultMode: "bypass",
          routes: [{ paths: ["/api/*"], mode: "bypass" }],
          batchingLimit: 5,
        },
        {
          slug: "admin-proxy",
          destinationUrl: "https://admin.example.com",
          headers: {},
          defaultMode: "block",
          routes: [
            { paths: ["/admin/*"], mode: "block" },
            { paths: ["/admin/users/*"], mode: "turnstile" },
          ],
          batchingLimit: 5,
        },
      ]),
    ).toBe(
      [
        "Loaded 2 configs:",
        "app-proxy | destination: https://example.com | routes: 1 route (bypass)",
        "admin-proxy | destination: https://admin.example.com | routes: 2 routes (block, turnstile)",
      ].join("\n"),
    );
  });

  test("handles an empty config list", () => {
    expect(formatConfigsSummary([])).toBe("Loaded 0 configs: none");
  });
});

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
        methods: ["GET"],
        paths: ["/api/*"],
        mode: "bypass",
      },
      {
        methods: ["POST"],
        paths: ["/auth/*"],
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
        methods: ["PUT"],
        paths: ["/admin/*", "/settings/*"],
        mode: "block",
      },
      {
        methods: ["PATCH"],
        paths: ["/admin/users/*"],
        mode: "turnstile",
      },
    ]);
  });

  test("skips invalid configs and keeps loading valid ones", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    try {
      const configs = await readConfigsFromDirectory("mocks/configs-mixed");

      expect(configs).toHaveLength(2);
      expect(configs.map((config) => config.slug).sort()).toEqual(["admin-proxy", "app-proxy"]);
      expect(configs[0]).toMatchObject({
        slug: "app-proxy",
        destinationUrl: "https://example.com",
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[0]).toContain("Failed to load config");
      expect(errorSpy.mock.calls[0]?.[0]).toContain("mock-invalid.yaml");
      expect(errorSpy.mock.calls[0]?.[0]).toContain(
        "turnstileSecret is required when any route uses turnstile mode",
      );
    } finally {
      errorSpy.mockRestore();
    }
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
        paths: ["/api/*"],
        mode: "bypass",
      },
    ],
    batchingLimit: 5,
  };

  const adminProxyConfig: Config = {
    slug: "app-proxy-admin",
    destinationUrl: "https://admin.example.com",
    headers: {},
    defaultMode: "block",
    routes: [
      {
        methods: ["PATCH", "PUT"],
        paths: ["/admin/*"],
        mode: "turnstile",
      },
    ],
    batchingLimit: 5,
  };

  const catchAllProxyConfig: Config = {
    slug: "catch-all-proxy",
    destinationUrl: "https://catch-all.example.com",
    headers: {},
    defaultMode: "block",
    routes: [
      {
        methods: ["GET"],
        mode: "turnstile",
      },
    ],
    batchingLimit: 5,
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
    expect(getProxyMode(adminProxyConfig, "/admin/users", "PUT")).toBe("turnstile");
    expect(getProxyMode(adminProxyConfig, "/admin/users", "GET")).toBe("block");
    expect(getProxyMode(catchAllProxyConfig, "/anything/here", "GET")).toBe("turnstile");
    expect(getProxyMode(catchAllProxyConfig, "/anything/here", "POST")).toBe("block");
  });
});
