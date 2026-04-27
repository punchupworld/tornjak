import { describe, expect, test } from "bun:test";

import { createApp } from "./app";
import { TURNSTILE_VERIFY_URL } from "./utils/turnstile";
import { createTestApp } from "../mocks/app";
import { installFetchMock } from "../mocks/fetch";

describe("batch handler", () => {
  test("proxies multiple bypassed routes in parallel", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async ({ input }) => {
      if (String(input).endsWith("/api/health")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [1, 2, 3] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/batch/app-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([{ path: "/api/health" }, { path: "/api/users", method: "GET" }]),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as Array<{
        status: number;
        body: unknown;
      }>;
      expect(result).toHaveLength(2);
      expect(result[0]!.status).toBe(200);
      expect(result[0]!.body).toEqual({ ok: true });
      expect(result[1]!.status).toBe(200);
      expect(result[1]!.body).toEqual({ data: [1, 2, 3] });
    } finally {
      restoreFetch();
    }
  });

  test("forwards batch request headers to each sub-request", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async ({ init }, calls) => {
      const headers = init?.headers as Headers;

      expect(headers.get("x-batch-auth")).toBe("batch-token");

      if (calls.length === 1) {
        expect(headers.get("x-client")).toBe("override");
      } else {
        expect(headers.get("x-client")).toBe("original");
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/batch/app-proxy", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-batch-auth": "batch-token",
            "x-client": "original",
          },
          body: JSON.stringify([
            { path: "/api/health", method: "GET", headers: { "x-client": "override" } },
            { path: "/api/users" },
          ]),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as Array<{ status: number }>;
      expect(result).toHaveLength(2);
      expect(result[0]!.status).toBe(200);
      expect(result[1]!.status).toBe(200);
    } finally {
      restoreFetch();
    }
  });

  test("stringifies JSON body in batch sub-requests", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async ({ init }, calls) => {
      if (calls.length === 1) {
        expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(
          JSON.stringify({ name: "test" }),
        );
      } else {
        expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe("raw string body");
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/batch/app-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([
            { path: "/api/health", method: "POST", body: { name: "test" } },
            { path: "/api/users", method: "POST", body: "raw string body" },
          ]),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as Array<{ status: number }>;
      expect(result).toHaveLength(2);
      expect(result[0]!.status).toBe(200);
      expect(result[1]!.status).toBe(200);
    } finally {
      restoreFetch();
    }
  });

  test("returns mixed responses for bypass and turnstile-missing-token routes", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/batch/app-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([
            { path: "/api/health", method: "GET" },
            { path: "/auth/login", method: "POST" },
          ]),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as Array<{ status: number; body: string }>;
      expect(result).toHaveLength(2);
      expect(result[0]!.status).toBe(200);
      expect(result[1]!.status).toBe(422);
      expect(result[1]!.body).toBe("Turnstile token required");
    } finally {
      restoreFetch();
    }
  });

  test("validates turnstile only once for multiple turnstile requests", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async ({ input }, calls) => {
      if (String(input) === TURNSTILE_VERIFY_URL) {
        expect(calls).toHaveLength(1);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/batch/admin-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([
            {
              path: "/admin/users/1",
              method: "PATCH",
              headers: {
                "cf-connecting-ip": "203.0.113.10",
                "cf-turnstile-response": "turnstile-token-123",
              },
            },
            {
              path: "/admin/users/2",
              method: "PATCH",
              headers: {
                "cf-connecting-ip": "203.0.113.10",
                "cf-turnstile-response": "turnstile-token-123",
              },
            },
          ]),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as Array<{ status: number }>;
      expect(result).toHaveLength(2);
      expect(result[0]!.status).toBe(200);
      expect(result[1]!.status).toBe(200);
    } finally {
      restoreFetch();
    }
  });

  test("returns 404 for unmatched slug in batch", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async () => {
      throw new Error("destination fetch should not be called for unmatched slugs");
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/batch/unknown-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([{ path: "/api/health" }]),
        }),
      );

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    } finally {
      restoreFetch();
    }
  });

  test("returns 413 when batch exceeds batchingLimit", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const body = Array.from({ length: 6 }, (_, i) => ({ path: `/api/item/${i}` }));
      const response = await app.fetch(
        new Request("http://localhost/batch/app-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

      expect(response.status).toBe(413);
      expect(await response.text()).toBe("Batch limit exceeded: max 5 requests allowed");
    } finally {
      restoreFetch();
    }
  });

  test("allows batch up to batchingLimit", async () => {
    const { app } = await createTestApp();
    const restoreFetch = installFetchMock(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const body = Array.from({ length: 5 }, (_, i) => ({ path: `/api/item/${i}` }));
      const response = await app.fetch(
        new Request("http://localhost/batch/app-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as Array<{ status: number }>;
      expect(result).toHaveLength(5);
    } finally {
      restoreFetch();
    }
  });

  test("rejects all batch requests when batchingLimit is 0", async () => {
    const app = createApp([
      {
        slug: "no-batch-proxy",
        destinationUrl: "https://example.com",
        headers: {},
        defaultMode: "bypass",
        routes: [{ paths: ["/api/*"], mode: "bypass" }],
        batchingLimit: 0,
      },
    ]);
    const restoreFetch = installFetchMock(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const response = await app.fetch(
        new Request("http://localhost/batch/no-batch-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([{ path: "/api/health" }]),
        }),
      );

      expect(response.status).toBe(413);
      expect(await response.text()).toBe("Batch limit exceeded: max 0 requests allowed");
    } finally {
      restoreFetch();
    }
  });
});

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
