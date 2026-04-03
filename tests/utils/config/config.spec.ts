import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readConfigsFromDirectory } from "../../../src/utils/config";

describe("readConfigsFromDirectory", () => {
  test("reads and validates all yaml configs in a directory", async () => {
    const configs = await readConfigsFromDirectory("tests/utils/config");

    expect(configs).toHaveLength(2);

    expect(configs).toContainEqual({
      slug: "app-proxy",
      destinationUrl: "https://example.com",
      headers: {
        "x-powered-by": "tornjak",
        "x-env": "test",
      },
      turnstileSecret: "secret-basic",
      defaultMode: "bypass",
      routes: [
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
      ],
    });

    expect(configs).toContainEqual({
      slug: "admin-proxy",
      destinationUrl: "https://admin.example.com",
      headers: {
        "x-powered-by": "tornjak",
        "x-env": "staging",
      },
      turnstileSecret: "secret-admin",
      defaultMode: "block",
      routes: [
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
      ],
    });
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
