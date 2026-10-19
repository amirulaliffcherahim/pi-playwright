# pi-playwright

> High-performance real browser automation, interactive web navigation, screenshot vision audit, and model-delegated inspection for [Pi Coding Agent](https://pi.dev).

`pi-playwright` equips Pi with real browser capabilities powered by Chromium/Edge via `playwright-core`. It introduces the unified `/play` command with an interactive model picker (similar to `/advisor-models`) allowing you to designate dedicated primary and fallback models to visually inspect and audit web pages without consuming tokens in your main session transcript.

---

## ✨ Features

- 🌐 **Real Browser Automation**: Launch, navigate, click, fill forms, press keys, and evaluate arbitrary JavaScript inside real desktop browser instances (Edge / Chrome).
- 👁️ **Visual & DOM Audits (`browser_audit`)**: Delegate full-page screenshot audits and questions to a dedicated vision model (e.g. `agy/gemini-3.8-flash` or `claude/claude-haiku-5-5`) with automatic fallback. Shields main chat context from large image/DOM tokens.
- 🎯 **Interactive Model Picker (`/play models`)**: Seamless TUI selector to configure and persist primary and fallback audit models across sessions.
- 📸 **High-Resolution Screenshots (`browser_screenshot`)**: Native viewport and full-page captures saved locally to `~/.pi/generated-images/` and returned as image blocks to vision-capable models.
- 🪟 **Headed & Headless Toggle**: Switch between interactive desktop browser windows and headless background execution on the fly via `/play head`.
- ⚡ **Zero-Bloat Single Process**: Automatically resolves local Chromium/Edge binaries; shuts down gracefully on Pi session termination.

---

## 📦 Installation

Install as a managed package directly via Pi:

```bash
pi install git:github.com/amirulaliffcherahim/pi-playwright
```

Or clone into your local Git packages:

```bash
cd ~/.pi/agent/git/github.com/amirulaliffcherahim
git clone https://github.com/amirulaliffcherahim/pi-playwright.git
```

Verify the installation:

```bash
pi list
```

---

## 🕹️ Slash Commands (`/play`)

Control browser state and audit configuration directly from Pi's chat prompt:

| Command | Description |
|---|---|
| `/play` | Open interactive action menu (select models, view status, toggle window mode) |
| `/play models` | Open interactive searchable model selector for primary and fallback audit models |
| `/play open <url>` | Launch browser and navigate directly to target URL |
| `/play close` | Close active browser session and release memory |
| `/play head` | Toggle between headed (visible desktop window) and headless mode |
| `/play status` | Display active browser executable, window state, and audit model configuration |

*(Note: `/browser` is preserved as an alias for backwards compatibility.)*

---

## 🛠️ Provided Tools

`pi-playwright` exposes 5 declarative tools to Pi's model agent and scripts:

### 1. `browser_navigate`
Navigates to a URL and extracts an indexed list of interactive elements (buttons, links, inputs):
```js
browser_navigate({ url: "https://github.com", headed: true })
```

### 2. `browser_interact`
Performs concrete actions on page elements:
```js
// Click by CSS selector or text locator
browser_interact({ action: "click", selector: "button:has-text('Sign In')" })

// Type text into an input field
browser_interact({ action: "type", selector: "input[name='q']", text: "playwright" })

// Press keys (Enter, Tab, Escape, etc.)
browser_interact({ action: "press", text: "Enter" })

// Evaluate custom JavaScript in page context
browser_interact({ action: "evaluate", script: "document.title" })
```

### 3. `browser_screenshot`
Captures viewports or full scrollable pages:
```js
browser_screenshot({ fullPage: false })
```

### 4. `browser_audit`
Asks a question or requests visual verification about the active web page using the designated audit model:
```js
browser_audit({
  question: "Is the checkout button enabled, and what error message is displayed?",
  includeScreenshot: true
})
```

### 5. `browser_close`
Closes the active Chromium session:
```js
browser_close({})
```

---

## ⚙️ Configuration

Configuration is stored in `~/.pi/agent/playwright.json`:

```json
{
  "primary": "agy/gemini-3.8-flash",
  "fallback": "claude/claude-haiku-5-5",
  "thinkingLevel": "minimal",
  "maxTokens": 1000
}
```

- `primary`: Designates the preferred fast vision model for page auditing.
- `fallback`: Backup model invoked automatically if the primary provider encounters rate limits or errors.
- `maxTokens`: Output budget for visual inspection summaries.

---

## 📄 License

MIT © [Amirul Aliff Cherahim](https://github.com/amirulaliffcherahim)
