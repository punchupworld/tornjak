import { createApp } from "../src/app";
import { readConfigsFromDirectory } from "../src/utils/config";

export async function createTestApp() {
  const configs = await readConfigsFromDirectory("mocks/configs");
  const app = createApp(configs);

  return { app, configs };
}
