import type { Browser, BrowserContext, Page } from "playwright-core";
import * as fs from "node:fs";
import * as path from "node:path";

const BROWSER_PATHS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];

let browserInstance: Browser | null = null;
let contextInstance: BrowserContext | null = null;
let pageInstance: Page | null = null;
let isHeadedMode = true;

export function resolveBrowserExecutable(): string {
  for (const p of BROWSER_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return "msedge.exe";
}

export function getHeadedMode(): boolean {
  return isHeadedMode;
}

export async function setHeadedMode(headed: boolean): Promise<void> {
  if (isHeadedMode !== headed) {
    isHeadedMode = headed;
    await closeBrowserSession();
  }
}

export async function getPage(): Promise<Page> {
  if (pageInstance && !pageInstance.isClosed()) {
    return pageInstance;
  }
  if (!browserInstance || !browserInstance.isConnected()) {
    // Loaded on first use: playwright-core costs ~300ms at pi startup.
    const { chromium } = await import("playwright-core");
    browserInstance = await chromium.launch({
      executablePath: resolveBrowserExecutable(),
      headless: !isHeadedMode,
      args: ["--no-first-run", "--no-default-browser-check"],
    });
  }
  contextInstance = await browserInstance.newContext({
    viewport: { width: 1280, height: 800 },
  });
  pageInstance = await contextInstance.newPage();
  return pageInstance;
}

export async function closeBrowserSession(): Promise<void> {
  if (pageInstance && !pageInstance.isClosed()) {
    await pageInstance.close().catch(() => {});
  }
  if (contextInstance) {
    await contextInstance.close().catch(() => {});
  }
  if (browserInstance && browserInstance.isConnected()) {
    await browserInstance.close().catch(() => {});
  }
  pageInstance = null;
  contextInstance = null;
  browserInstance = null;
}

export interface InteractiveElement {
  index: number;
  tag: string;
  text: string;
  selector: string;
}

export async function extractInteractiveElements(page: Page, limit = 35): Promise<string[]> {
  return page.evaluate((maxItems) => {
    const items: string[] = [];
    const els = document.querySelectorAll(
      'a, button, input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"]',
    );
    let idx = 1;
    for (const el of Array.from(els)) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        style.visibility === "hidden" ||
        style.display === "none"
      ) {
        continue;
      }
      const tag = el.tagName.toLowerCase();
      const text = (
        (el as HTMLElement).innerText ||
        el.getAttribute("placeholder") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("value") ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ");

      let selector = "";
      if (el.id) {
        selector = `#${el.id}`;
      } else if (el.getAttribute("name")) {
        selector = `${tag}[name="${el.getAttribute("name")}"]`;
      } else if (el.getAttribute("aria-label")) {
        selector = `${tag}[aria-label="${el.getAttribute("aria-label")}"]`;
      } else {
        selector = tag;
      }

      if (text || el.getAttribute("name") || el.id) {
        items.push(`[${idx++}] <${tag}> "${text.slice(0, 45)}" (selector: '${selector}')`);
      }
      if (items.length >= maxItems) break;
    }
    return items;
  }, limit);
}
