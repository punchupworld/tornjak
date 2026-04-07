import { createApp } from "./app";
import { formatConfigsSummary, readConfigsFromDirectory } from "./utils/config/helpers";

const configs = await readConfigsFromDirectory("configs");
console.log(formatConfigsSummary(configs));

const app = createApp(configs);
app.listen(Number(Bun.env.PORT ?? 3000));

console.log(`Tornjak is running on http://localhost:${app.server?.port}`);
