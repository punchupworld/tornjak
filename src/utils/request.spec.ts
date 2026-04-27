import { beforeEach, describe, expect, test } from "bun:test";

import { TURNSTILE_VERIFY_URL, clearTurnstileGlobalCache } from "./turnstile";
import { handleRequest } from "./request";
import { installFetchMock } from "../../mocks/fetch";
import { createTestApp } from "../../mocks/app";

beforeEach(() => {
  clearTurnstileGlobalCache();
});

describe("handleRequest", () => {
  test("returns 404 for unmatched slugs", async () => {
    const { configs } = await createTestApp();
    const restoreFetch = installFetchMock(async () => {
      throw new Error("destination fetch should not be called for unmatched slugs");
    });

    try {
      const response = await handleRequest(
        new Request("http://localhost/unknown-proxy/path"),
        configs,
      );

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    } finally {
      restoreFetch();
    }
  });

  test("proxies bypassed routes to the configured destination", async () => {
    const { configs } = await createTestApp();
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
      const response = await handleRequest(
        new Request("http://localhost/app-proxy/api/health?foo=bar", {
          headers: {
            Origin: "http://example.com",
            "x-client": "bun",
          },
        }),
        configs,
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ proxied: true });
    } finally {
      restoreFetch();
    }
  });

  test("blocks requests when the matched mode resolves to block", async () => {
    const { configs } = await createTestApp();
    const restoreFetch = installFetchMock(async () => {
      throw new Error("destination fetch should not be called for blocked requests");
    });

    try {
      const response = await handleRequest(
        new Request("http://localhost/admin-proxy/anything"),
        configs,
      );

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("Forbidden");
    } finally {
      restoreFetch();
    }
  });

  test("verifies turnstile routes before proxying", async () => {
    const { configs } = await createTestApp();
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
      const response = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/42", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "203.0.113.10",
            "cf-turnstile-response": "turnstile-token-123",
          },
          body: JSON.stringify({ active: true }),
        }),
        configs,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      restoreFetch();
    }
  });

  test("caches successful turnstile validation when cf-turnstile-cache-ms is specified", async () => {
    const { configs } = await createTestApp();
    let verifyCalls = 0;
    const restoreFetch = installFetchMock(async ({ input }) => {
      if (String(input) === TURNSTILE_VERIFY_URL) {
        verifyCalls++;
        return new Response(JSON.stringify({ success: true }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    try {
      const headers = {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
        "cf-turnstile-response": "turnstile-token-123",
        "cf-turnstile-cache-ms": "60000",
      };

      const response1 = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/42", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ active: true }),
        }),
        configs,
      );
      expect(response1.status).toBe(200);
      expect(verifyCalls).toBe(1);

      const response2 = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/43", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ active: false }),
        }),
        configs,
      );
      expect(response2.status).toBe(200);
      expect(verifyCalls).toBe(1);
    } finally {
      restoreFetch();
    }
  });

  test("re-validates turnstile when cached token expires", async () => {
    const { configs } = await createTestApp();
    let verifyCalls = 0;
    const restoreFetch = installFetchMock(async ({ input }) => {
      if (String(input) === TURNSTILE_VERIFY_URL) {
        verifyCalls++;
        return new Response(JSON.stringify({ success: true }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    try {
      const headers = {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
        "cf-turnstile-response": "turnstile-token-123",
        "cf-turnstile-cache-ms": "1000",
      };

      const response1 = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/42", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ active: true }),
        }),
        configs,
      );
      expect(response1.status).toBe(200);
      expect(verifyCalls).toBe(1);

      const originalNow = Date.now;
      Date.now = () => originalNow() + 2000;

      const response2 = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/43", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ active: false }),
        }),
        configs,
      );
      expect(response2.status).toBe(200);
      expect(verifyCalls).toBe(2);

      Date.now = originalNow;
    } finally {
      restoreFetch();
    }
  });

  test("does not cache turnstile when cf-turnstile-cache-ms is absent", async () => {
    const { configs } = await createTestApp();
    let verifyCalls = 0;
    const restoreFetch = installFetchMock(async ({ input }) => {
      if (String(input) === TURNSTILE_VERIFY_URL) {
        verifyCalls++;
        return new Response(JSON.stringify({ success: true }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    try {
      const headers = {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
        "cf-turnstile-response": "turnstile-token-123",
      };

      const response1 = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/42", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ active: true }),
        }),
        configs,
      );
      expect(response1.status).toBe(200);
      expect(verifyCalls).toBe(1);

      const response2 = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/43", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ active: false }),
        }),
        configs,
      );
      expect(response2.status).toBe(200);
      expect(verifyCalls).toBe(2);
    } finally {
      restoreFetch();
    }
  });

  test("does not cache turnstile when validation fails", async () => {
    const { configs } = await createTestApp();
    let verifyCalls = 0;
    const restoreFetch = installFetchMock(async ({ input }) => {
      if (String(input) === TURNSTILE_VERIFY_URL) {
        verifyCalls++;
        return new Response(JSON.stringify({ success: false }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    try {
      const headers = {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
        "cf-turnstile-response": "turnstile-token-123",
        "cf-turnstile-cache-ms": "60000",
      };

      const response1 = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/42", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ active: true }),
        }),
        configs,
      );
      expect(response1.status).toBe(403);
      expect(verifyCalls).toBe(1);

      const response2 = await handleRequest(
        new Request("http://localhost/admin-proxy/admin/users/43", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ active: false }),
        }),
        configs,
      );
      expect(response2.status).toBe(403);
      expect(verifyCalls).toBe(2);
    } finally {
      restoreFetch();
    }
  });
});
