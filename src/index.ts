import { createApp } from "./app";
import { readConfigsFromDirectory } from "./utils/config";

const configs = await readConfigsFromDirectory("configs");
const app = createApp(configs);

app.listen(Number(Bun.env.PORT ?? 3000));

console.log(`Tornjak is running on port ${app.server?.port}`);
