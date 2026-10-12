import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    supabase: { url: string; publishableKey: string; secretKey: string; mailpitUrl: string };
  }
}

// Reads the local Supabase stack's URL and keys from the CLI so DB tests never
// touch the cloud project in .env.local.
export default function setup(project: TestProject) {
  let output: string;
  try {
    output = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Local Supabase is not running. Start it with `npm run db:start`.");
  }

  const env = Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.match(/^([A-Z_0-9]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );

  project.provide("supabase", {
    url: env.API_URL,
    publishableKey: env.PUBLISHABLE_KEY,
    secretKey: env.SECRET_KEY,
    mailpitUrl: env.MAILPIT_URL,
  });
}
