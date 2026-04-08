import { describe, expect, test } from "bun:test";

import { configSchema } from "./schema";

describe("configSchema", () => {
  test("rejects routes without methods or paths", () => {
    expect(() =>
      configSchema.parse({
        slug: "invalid-proxy",
        destinationUrl: "https://example.com",
        routes: [{ mode: "block" }],
      }),
    ).toThrow("methods or paths is required for each route");
  });

  test("requires a turnstile secret when any route uses turnstile mode", () => {
    expect(() =>
      configSchema.parse({
        slug: "secure-proxy",
        destinationUrl: "https://example.com",
        routes: [
          {
            mode: "turnstile",
            paths: ["/secure/*"],
          },
        ],
      }),
    ).toThrow("turnstileSecret is required when any route uses turnstile mode");
  });
});
