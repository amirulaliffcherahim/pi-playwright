import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";
import { queryDesignatedModel } from "./audit.js";
import {
  closeBrowserSession,
  extractInteractiveElements,
  getHeadedMode,
  getPage,
  setHeadedMode,
} from "./browser.js";
import { handlePlayCommand } from "./commands.js";

export default function (pi: ExtensionAPI): void {
  // 1. Tool: browser_navigate
  pi.registerTool({
    name: "browser_navigate",
    label: "Browser Navigate",
    description:
      "Navigate to URL in real browser. Returns page title and concise interactive element list.",
    promptSnippet: "browser_navigate({ url: 'https://...' })",
    parameters: Type.Object({
      url: Type.String({ description: "Target URL to open (e.g. https://example.com)" }),
      headed: Type.Optional(
        Type.Boolean({
          description: "Open in visible desktop browser window (default true).",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      if (typeof params.headed === "boolean" && params.headed !== getHeadedMode()) {
        await setHeadedMode(params.headed);
      }
      try {
        const page = await getPage();
        await page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(500);

        const title = await page.title();
        const currentUrl = page.url();
        const elements = await extractInteractiveElements(page, 30);

        const summary = [
          `Navigated to: ${currentUrl}`,
          `Title: ${title}`,
          "",
          "Interactive elements:",
          ...elements,
        ].join("\n");

        return {
          content: [{ type: "text", text: summary.slice(0, 2000) }],
          details: { url: currentUrl, title },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Browser error: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // 2. Tool: browser_interact (click, type, press key, evaluate script)
  pi.registerTool({
    name: "browser_interact",
    label: "Browser Interact",
    description: "Perform action on current page: click, fill/type text, or press Enter/key.",
    parameters: Type.Object({
      action: Type.String({
        description: "Action type: 'click', 'type', 'press', or 'evaluate'",
      }),
      selector: Type.Optional(
        Type.String({
          description: "CSS selector, element text, or locator (e.g. 'button:has-text(\"Search\")')",
        }),
      ),
      text: Type.Optional(
        Type.String({
          description: "Text to type into input, or key to press (e.g. 'Enter', 'Escape')",
        }),
      ),
      script: Type.Optional(
        Type.String({
          description: "JavaScript snippet to execute in page when action is 'evaluate'",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      try {
        const page = await getPage();
        if (params.action === "click") {
          if (!params.selector) throw new Error("Missing selector for click");
          await page.click(params.selector, { timeout: 10000 });
          await page.waitForTimeout(500);
          return {
            content: [
              {
                type: "text",
                text: `Clicked: ${params.selector}. Current URL: ${page.url()}`,
              },
            ],
          };
        }
        if (params.action === "type") {
          if (!params.selector) throw new Error("Missing selector for type");
          await page.fill(params.selector, params.text ?? "", { timeout: 10000 });
          return {
            content: [
              {
                type: "text",
                text: `Filled '${params.selector}' with '${params.text}'`,
              },
            ],
          };
        }
        if (params.action === "press") {
          const key = params.text || "Enter";
          if (params.selector) {
            await page.press(params.selector, key);
          } else {
            await page.keyboard.press(key);
          }
          await page.waitForTimeout(500);
          return {
            content: [{ type: "text", text: `Pressed key: ${key}. URL: ${page.url()}` }],
          };
        }
        if (params.action === "evaluate") {
          if (!params.script) throw new Error("Missing script for evaluate");
          const res = await page.evaluate(params.script);
          const out = typeof res === "object" ? JSON.stringify(res) : String(res);
          return {
            content: [{ type: "text", text: `Eval result: ${out.slice(0, 1500)}` }],
          };
        }
        return {
          content: [{ type: "text", text: `Unknown action: ${params.action}` }],
          isError: true,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Interaction error: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // 3. Tool: browser_screenshot (vision)
  pi.registerTool({
    name: "browser_screenshot",
    label: "Browser Screenshot",
    description:
      "Capture screenshot of the active browser view. Returns image content to Pi vision and saves locally.",
    parameters: Type.Object({
      fullPage: Type.Optional(
        Type.Boolean({ description: "Capture full scrollable page (default false)." }),
      ),
    }),
    async execute(_toolCallId, params) {
      try {
        const page = await getPage();
        const buffer = await page.screenshot({
          fullPage: params.fullPage ?? false,
          type: "jpeg",
          quality: 80,
        });

        const tmpDir = path.join(
          process.env.USERPROFILE || process.env.HOME || "C:/Users/amiru",
          ".pi/generated-images",
        );
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        const imgPath = path.join(tmpDir, `browser-${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, buffer);

        const base64Data = buffer.toString("base64");
        return {
          content: [
            {
              type: "image",
              data: base64Data,
              mimeType: "image/jpeg",
            },
            {
              type: "text",
              text: `Screenshot captured and saved to ${imgPath}`,
            },
          ],
          details: { path: imgPath },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Screenshot error: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // 4. Designated Model Inspector: browser_audit
  pi.registerTool({
    name: "browser_audit",
    label: "Browser Visual & DOM Audit",
    description:
      "Ask a question or request verification about the current page. Automatically runs via designated primary/fallback model, shielding main chat from screenshot/DOM token consumption.",
    parameters: Type.Object({
      question: Type.String({
        description:
          "Question or verification request (e.g. 'Is the submit button disabled?', 'What error message is visible?')",
      }),
      includeScreenshot: Type.Optional(
        Type.Boolean({
          description:
            "Whether to include visual screenshot with the designated vision model query (default true).",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const page = await getPage();
        const title = await page.title();
        const url = page.url();

        let imgBase64: string | undefined;
        if (params.includeScreenshot !== false) {
          const buf = await page.screenshot({ type: "jpeg", quality: 75 });
          imgBase64 = buf.toString("base64");
        }

        const pageText = await page.evaluate(() => {
          return document.body ? document.body.innerText.slice(0, 3000) : "";
        });

        const prompt = [
          "You are a browser inspection agent. Answer concisely.",
          `URL: ${url}`,
          `Page Title: ${title}`,
          `Page Visible Text Snippet:\n${pageText}`,
          `User Verification Question: ${params.question}`,
        ].join("\n\n");

        const outcome = await queryDesignatedModel(ctx, prompt, imgBase64);

        return {
          content: [
            {
              type: "text",
              text: `[Model: ${outcome.modelUsed}${outcome.fallbackUsed ? " (fallback)" : ""}]\n${outcome.text}`,
            },
          ],
          details: outcome,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Browser audit failed: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // 5. Tool: browser_close
  pi.registerTool({
    name: "browser_close",
    label: "Browser Close",
    description: "Close active browser session to free memory.",
    parameters: Type.Object({}),
    async execute() {
      await closeBrowserSession();
      return {
        content: [{ type: "text", text: "Browser closed successfully." }],
      };
    },
  });

  // Cleanup on session shutdown
  pi.on("session_shutdown", async () => {
    await closeBrowserSession();
  });

  // Slash commands: /play and legacy alias /browser
  pi.registerCommand("play", {
    description: "Playwright browser control & audit model picker (/play [models|open|close|head|status])",
    handler: handlePlayCommand,
  });

  pi.registerCommand("browser", {
    description: "Alias for /play",
    handler: handlePlayCommand,
  });
}
