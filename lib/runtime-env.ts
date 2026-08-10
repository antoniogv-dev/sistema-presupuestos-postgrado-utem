import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface RuntimeBindings {
  DB?: D1Database;
  NEXT_PUBLIC_APP_NAME?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  INTERNAL_API_KEY?: string;
}

function cloudflareBindings(): RuntimeBindings | undefined {
  try {
    return getCloudflareContext().env as RuntimeBindings;
  } catch {
    return undefined;
  }
}

export function runtimeValue(name: keyof RuntimeBindings): string | undefined {
  const value = cloudflareBindings()?.[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  const local = process.env[name];
  return typeof local === "string" && local.trim() ? local.trim() : undefined;
}

export function d1Database(): D1Database {
  const database = cloudflareBindings()?.DB;
  if (!database) throw new Error("DATABASE_NOT_CONFIGURED");
  return database;
}
