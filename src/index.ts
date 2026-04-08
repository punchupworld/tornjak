import { createApp } from "./app";
import { formatConfigsSummary, readConfigsFromDirectory } from "./utils/config/helpers";
import { watch } from "node:fs";

const CONFIGS_DIR = Bun.env.CONFIGS_DIR ?? "configs";
const PORT = Number(Bun.env.PORT ?? 3000);

let app = createApp([]);
let reloadInProgress = false;
let reloadRequested = false;

await startApp();

const watcher = watch(CONFIGS_DIR, { recursive: true }, () => {
  console.log(`Config change detected in ${CONFIGS_DIR}, reloading...`);
  void scheduleReload();
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function scheduleReload() {
  if (reloadInProgress) {
    reloadRequested = true;
    return;
  }

  reloadInProgress = true;

  try {
    await startApp(true);
  } finally {
    reloadInProgress = false;

    if (reloadRequested) {
      reloadRequested = false;
      await scheduleReload();
    }
  }
}

async function startApp(stopCurrentApp = false) {
  const configs = await readConfigsFromDirectory(CONFIGS_DIR);

  console.log(formatConfigsSummary(configs));

  if (stopCurrentApp) {
    await app.stop(true);
  }

  app = createApp(configs);
  app.listen(PORT);

  console.log(`Tornjak is running on http://localhost:${app.server?.port}`);
}

async function shutdown() {
  watcher.close();
  await app.stop(true);
  process.exit(0);
}
