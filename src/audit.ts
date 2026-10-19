import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadPlaywrightConfig, parseModelSpec } from "./config.js";

export interface AuditOutcome {
  text: string;
  modelUsed: string;
  fallbackUsed: boolean;
}

/**
 * Execute audit prompt against the designated primary model with automatic fallback.
 */
export async function queryDesignatedModel(
  ctx: ExtensionContext,
  promptText: string,
  imageBase64?: string,
): Promise<AuditOutcome> {
  const config = loadPlaywrightConfig();
  const primarySpec = parseModelSpec(config.primary);
  const fallbackSpec = parseModelSpec(config.fallback);

  const contentParts: any[] = [{ type: "text", text: promptText }];
  if (imageBase64) {
    contentParts.push({
      type: "image",
      data: imageBase64,
      mimeType: "image/jpeg",
    });
  }

  const messages = [
    {
      role: "user" as const,
      content: contentParts,
      timestamp: Date.now(),
    },
  ];

  // Try primary model
  const primaryModel = ctx.modelRegistry.find(primarySpec.provider, primarySpec.id);
  if (primaryModel && ctx.modelRegistry.hasConfiguredAuth(primaryModel)) {
    try {
      const res = await ctx.modelRegistry.complete(
        primaryModel,
        { messages },
        {
          maxTokens: config.maxTokens ?? 1000,
          signal: ctx.signal,
        },
      );
      const out = res.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n")
        .trim();
      if (out) {
        return {
          text: out,
          modelUsed: `${primarySpec.provider}/${primarySpec.id}`,
          fallbackUsed: false,
        };
      }
    } catch {}
  }

  // Fallback model
  const fallbackModel = ctx.modelRegistry.find(fallbackSpec.provider, fallbackSpec.id);
  if (fallbackModel && ctx.modelRegistry.hasConfiguredAuth(fallbackModel)) {
    try {
      const fallbackMessages = [
        {
          role: "user" as const,
          content: fallbackModel.capabilities?.images
            ? contentParts
            : [{ type: "text", text: promptText }],
          timestamp: Date.now(),
        },
      ];

      const res = await ctx.modelRegistry.complete(
        fallbackModel,
        { messages: fallbackMessages },
        {
          maxTokens: config.maxTokens ?? 1000,
          signal: ctx.signal,
        },
      );
      const out = res.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n")
        .trim();
      return {
        text: out || "(No text response)",
        modelUsed: `${fallbackSpec.provider}/${fallbackSpec.id}`,
        fallbackUsed: true,
      };
    } catch (err: any) {
      throw new Error(
        `Both primary (${config.primary}) and fallback (${config.fallback}) audit models failed: ${err.message}`,
      );
    }
  }

  throw new Error(
    `Neither primary (${config.primary}) nor fallback (${config.fallback}) audit models are available with active credentials.`,
  );
}
