import { expect, test } from "bun:test";

import { createApp } from "../src/app";
import { readConfigsFromDirectory } from "../src/utils/config";

test("responds with json and cors headers", async () => {
  const configs = await readConfigsFromDirectory("tests/utils/config");
  const app = createApp(configs);

  const response = await app.fetch(
    new Request("http://localhost/", {
      headers: {
        Origin: "http://example.com",
      },
    }),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe("http://example.com");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("stores configs passed to the factory", async () => {
  const configs = await readConfigsFromDirectory("tests/utils/config");
  const app = createApp(configs);

  expect(app.store.configs).toEqual(configs);
  expect(app.store.configs).toHaveLength(2);
});
