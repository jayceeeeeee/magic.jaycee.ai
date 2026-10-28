import { DEV_MASTER_ACCOUNT_IDS } from "./master-catalog.js";

export const DEV_PROJECT_URL = "https://mylnagvqngsgcmlvwttu.supabase.co";
export const PROD_PROJECT_URL = "https://ndtnfwyfdfdcxljvvjfd.supabase.co";

export function getEnvironment(projectUrl: string) {
  if (projectUrl === PROD_PROJECT_URL) {
    return {
      name: "production",
      serverName: "magic-game",
      siteUrl: "https://magic.jaycee.ai",
      masterAccountIds: {} as Record<string, string>,
    };
  }
  if (projectUrl === DEV_PROJECT_URL) {
    return {
      name: "development",
      serverName: "magic-game-dev",
      siteUrl: "http://localhost:3000",
      masterAccountIds: DEV_MASTER_ACCOUNT_IDS as Record<string, string>,
    };
  }
  throw new Error("Unsupported Magic Dev Supabase project.");
}

export type GameEnvironment = ReturnType<typeof getEnvironment>;
