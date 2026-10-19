import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

export interface PlaywrightConfig {
  primary: string;
  fallback: string;
  thinkingLevel?: string;
  maxTokens?: number;
}

const DEFAULT_CONFIG: PlaywrightConfig = {
  primary: "agy/gemini-3.8-flash",
  fallback: "claude/claude-haiku-5-5",
  thinkingLevel: "minimal",
  maxTokens: 1000,
};

export function getConfigPath(): string {
  const agentDir =
    process.env.PI_AGENT_DIR ||
    path.join(process.env.USERPROFILE || process.env.HOME || "C:/Users/amiru", ".pi/agent");
  return path.join(agentDir, "playwright.json");
}

export function loadPlaywrightConfig(): PlaywrightConfig {
  const p = getConfigPath();
  try {
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<PlaywrightConfig>;
      return {
        primary: parsed.primary || DEFAULT_CONFIG.primary,
        fallback: parsed.fallback || DEFAULT_CONFIG.fallback,
        thinkingLevel: parsed.thinkingLevel || DEFAULT_CONFIG.thinkingLevel,
        maxTokens: typeof parsed.maxTokens === "number" ? parsed.maxTokens : DEFAULT_CONFIG.maxTokens,
      };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function savePlaywrightConfig(cfg: PlaywrightConfig): string {
  const p = getConfigPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  return p;
}

export function parseModelSpec(spec: string): { provider: string; id: string } {
  const slash = spec.indexOf("/");
  if (slash !== -1) {
    return {
      provider: spec.slice(0, slash).trim(),
      id: spec.slice(slash + 1).trim(),
    };
  }
  return {
    provider: "google",
    id: spec.trim(),
  };
}

export function getAvailableModelRefs(ctx: ExtensionContext): string[] {
  if (typeof ctx.modelRegistry?.getAvailable === "function") {
    try {
      const models = ctx.modelRegistry.getAvailable();
      return [...new Set(models.map((m) => `${m.provider}/${m.id}`))];
    } catch {}
  }
  return [DEFAULT_CONFIG.primary, DEFAULT_CONFIG.fallback];
}
