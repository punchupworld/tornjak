import cors from "@elysiajs/cors";
import { Elysia } from "elysia";

import type { Config } from "./utils/config";

export const createApp = (configs: Config[]) =>
  new Elysia()
    .state({ configs })
    .use(cors())
    .get("/", () => ({ status: "ok" }));
