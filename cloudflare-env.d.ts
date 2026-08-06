interface CloudflareEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  NEXT_PUBLIC_APP_NAME: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: string;
  CLOUDFLARE_ACCESS_AUD: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  INTERNAL_API_KEY?: string;
}
