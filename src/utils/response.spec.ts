import { describe, expect, test } from "bun:test";

import { serializeResponses } from "./response";

describe("serializeResponses", () => {
  test("serializes JSON responses as parsed objects", async () => {
    const result = await serializeResponses([
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe(200);
    expect(result[0]!.body).toEqual({ ok: true });
  });

  test("falls back to raw text for invalid JSON with JSON content-type", async () => {
    const result = await serializeResponses([
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ]);

    expect(result[0]!.body).toBe("not-json");
  });

  test("keeps raw text for non-JSON responses", async () => {
    const result = await serializeResponses([new Response("Forbidden", { status: 403 })]);

    expect(result[0]!.status).toBe(403);
    expect(result[0]!.body).toBe("Forbidden");
  });

  test("captures headers and statusText", async () => {
    const result = await serializeResponses([
      new Response("hello", {
        status: 201,
        statusText: "Created",
        headers: { "x-custom": "value" },
      }),
    ]);

    expect(result[0]!.status).toBe(201);
    expect(result[0]!.statusText).toBe("Created");
    expect(result[0]!.headers["x-custom"]).toBe("value");
  });
});
