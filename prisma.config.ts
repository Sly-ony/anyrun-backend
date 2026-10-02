import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Instructs npx prisma db seed to use the tsx execution process
    seed: "tsx prisma/seed.ts", 
  },
  datasource: {
    url: dbUrl, 
  },
});
