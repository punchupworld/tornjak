import { describe, expect, test } from "bun:test";

import { getTurnstileToken } from "./turnstile";

describe("getTurnstileToken", () => {
  test("reads the configured headers before the query string", () => {
    const request = new Request("http://localhost/proxy?turnstile-token=query-token", {
      headers: {
        "cf-turnstile-response": "header-token",
        "x-turnstile-token": "secondary-header-token",
      },
    });

    expect(getTurnstileToken(request)).toBe("header-token");
  });

  test("falls back to the query string token", () => {
    const request = new Request("http://localhost/proxy?turnstile-token=query-token");

    expect(getTurnstileToken(request)).toBe("query-token");
  });

  test("ignores blank token values", () => {
    const request = new Request("http://localhost/proxy?turnstile-token=   ", {
      headers: {
        "cf-turnstile-response": "  ",
        "x-turnstile-token": "",
      },
    });

    expect(getTurnstileToken(request)).toBeNull();
  });
});
