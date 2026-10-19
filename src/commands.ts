import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  closeBrowserSession,
  getHeadedMode,
  getPage,
  resolveBrowserExecutable,
  setHeadedMode,
} from "./browser.js";
import {
  getAvailableModelRefs,
  loadPlaywrightConfig,
  savePlaywrightConfig,
} from "./config.js";

function emit(
  ctx: ExtensionCommandContext,
  text: string,
  type: "info" | "warning" | "error" = "info",
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(text, type);
  } else if (type === "warning" || type === "error") {
    console.error(text);
  } else {
    console.log(text);
  }
}

export async function handlePlayCommand(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const sub = parts[0]?.toLowerCase();

  // /play models | /play model
  if (sub === "model" || sub === "models") {
    if (!ctx.hasUI) {
      const cfg = loadPlaywrightConfig();
      emit(ctx, `Current Playwright audit models: Primary=${cfg.primary}, Fallback=${cfg.fallback}`);
      return;
    }

    const available = getAvailableModelRefs(ctx);
    const cfg = loadPlaywrightConfig();

    // 1. Pick Primary Model
    const primaryChoice = await ctx.ui.select(
      `Select Primary Audit Model (Current: ${cfg.primary})`,
      available,
    );
    if (!primaryChoice) {
      emit(ctx, "Model selection cancelled.", "warning");
      return;
    }

    // 2. Pick Fallback Model
    const fallbackChoice = await ctx.ui.select(
      `Select Fallback Audit Model (Current: ${cfg.fallback})`,
      ["(none)", ...available],
    );

    const updated = {
      ...cfg,
      primary: primaryChoice,
      fallback: fallbackChoice === "(none)" ? "" : fallbackChoice || cfg.fallback,
    };
    savePlaywrightConfig(updated);
    emit(ctx, `Saved Playwright audit models: Primary=${updated.primary}, Fallback=${updated.fallback || "none"}`);
    return;
  }

  // /play open <url>
  if (sub === "open") {
    const url = parts[1];
    if (!url) {
      emit(ctx, "Usage: /play open <url>", "warning");
      return;
    }
    try {
      const page = await getPage();
      await page.goto(url.startsWith("http") ? url : `https://${url}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      emit(ctx, `Opened ${url} in browser window (title: "${await page.title()}")`);
    } catch (err: any) {
      emit(ctx, `Failed to open ${url}: ${err.message}`, "error");
    }
    return;
  }

  // /play close
  if (sub === "close") {
    await closeBrowserSession();
    emit(ctx, "Browser session closed.");
    return;
  }

  // /play head | /play headless
  if (sub === "head" || sub === "headed" || sub === "headless") {
    const nextMode = sub === "headless" ? false : !getHeadedMode();
    await setHeadedMode(nextMode);
    emit(ctx, `Browser mode toggled to: ${nextMode ? "headed (visible desktop window)" : "headless"}`);
    return;
  }

  // /play config | /play status
  if (sub === "config" || sub === "status") {
    const cfg = loadPlaywrightConfig();
    const statusLines = [
      "pi-playwright status:",
      `  Browser executable: ${resolveBrowserExecutable()}`,
      `  Window mode: ${getHeadedMode() ? "headed (visible window)" : "headless"}`,
      `  Audit primary model: ${cfg.primary}`,
      `  Audit fallback model: ${cfg.fallback || "(none)"}`,
      `  Thinking level: ${cfg.thinkingLevel || "minimal"}`,
      `  Max audit tokens: ${cfg.maxTokens ?? 1000}`,
      "",
      "Subcommands:",
      "  /play models       - Open interactive model picker for audit primary & fallback",
      "  /play open <url>   - Launch browser and navigate to URL",
      "  /play close        - Close active browser session",
      "  /play head         - Toggle headed vs headless mode",
      "  /play status       - View active configuration",
    ];
    emit(ctx, statusLines.join("\n"));
    return;
  }

  // Default: show usage or open model selector if run bare in interactive UI
  if (!sub && ctx.hasUI) {
    const action = await ctx.ui.select("Pi Playwright (/play) Action", [
      "Select Audit Models (/play models)",
      "View Status & Config (/play status)",
      "Toggle Headed / Headless Window",
      "Close Browser Session",
    ]);
    if (action?.includes("Models")) {
      return handlePlayCommand("models", ctx);
    }
    if (action?.includes("Status")) {
      return handlePlayCommand("status", ctx);
    }
    if (action?.includes("Toggle")) {
      return handlePlayCommand("head", ctx);
    }
    if (action?.includes("Close")) {
      return handlePlayCommand("close", ctx);
    }
    return;
  }

  emit(
    ctx,
    "Usage: /play [models | open <url> | close | head | status]",
    "warning",
  );
}
