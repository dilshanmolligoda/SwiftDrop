import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Same lookup as the Nest app: apps/api/.env first, then the repo-root .env
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node -r ./prisma/ts-loader.cjs prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
