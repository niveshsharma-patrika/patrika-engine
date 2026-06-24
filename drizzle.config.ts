import type { Config } from "drizzle-kit";

// Data layer for the AWS/RDS deployment. DATABASE_URL points at:
//   • local dev  → postgresql://<you>@localhost:5432/patrika_engine_dev
//   • production → the RDS Postgres instance
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
