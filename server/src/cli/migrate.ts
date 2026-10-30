// Applies pending database migrations (`server/migrations`).
import { loadConfig } from '../config.js';
import { migrate } from '../migrate.js';

await migrate(loadConfig().databaseUrl, console.log);
