import { describe, expect, test } from "bun:test";

import { TURNSTILE_VERIFY_URL } from "./utils/turnstile";
import { createTestApp } from "../mocks/app";
import { installFetchMock } from "../mocks/fetch";

describe("catch-all handler", () => {
  test("returns 404 for unmatched slugs", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async () => {
      throw new Error("destination fetch should not be called for unmatched slugs");
    });

    try {
      const response = await app.fetch(new Request("http://localhost/unknown-proxy/path"));

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    } finally {
      restoreFetch();
    }
  });

  test("proxies bypassed routes to the configured destination", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async ({ input, init }) => {
      const headers = init?.headers;

      expect(String(input)).toBe("https://example.com/api/health?foo=bar");
      expect(init?.method).toBe("GET");
      expect(headers).toBeInstanceOf(Headers);
      expect((headers as Headers).get("x-powered-by")).toBe("tornjak");
      expect((headers as Headers).get("x-env")).toBe("test");

      return new Response(JSON.stringify({ proxied: true }), {
        status: 201,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/app-proxy/api/health?foo=bar", {
          headers: {
            Origin: "http://example.com",
            "x-client": "bun",
          },
        }),
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ proxied: true });
    } finally {
      restoreFetch();
    }
  });

  test("blocks requests when the matched mode resolves to block", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async () => {
      throw new Error("destination fetch should not be called for blocked requests");
    });

    try {
      const response = await app.fetch(new Request("http://localhost/admin-proxy/anything"));

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("Forbidden");
    } finally {
      restoreFetch();
    }
  });

  test("verifies turnstile routes before proxying", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async ({ input, init }, calls) => {
      const headers = init?.headers;

      if (String(input) === TURNSTILE_VERIFY_URL) {
        expect(init?.method).toBe("POST");
        expect(
          JSON.parse(String(init?.body)) as { secret: string; response: string; remoteip: string },
        ).toEqual({
          secret: "secret-admin",
          response: "turnstile-token-123",
          remoteip: "203.0.113.10",
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "content-type": "application/json",
          },
        });
      }

      expect(String(input)).toBe("https://admin.example.com/admin/users/42");
      expect(calls).toHaveLength(2);
      expect(init?.method).toBe("PATCH");
      expect(headers).toBeInstanceOf(Headers);
      expect((headers as Headers).get("x-powered-by")).toBe("tornjak");
      expect((headers as Headers).get("x-env")).toBe("staging");
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(
        JSON.stringify({ active: true }),
      );

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/admin-proxy/admin/users/42", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "203.0.113.10",
            "cf-turnstile-response": "turnstile-token-123",
          },
          body: JSON.stringify({ active: true }),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      restoreFetch();
    }
  });
});
