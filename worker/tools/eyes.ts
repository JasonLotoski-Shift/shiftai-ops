// EYES — the agent's sight. An in-process SDK MCP server with one tool, `screenshot`,
// that renders the current prototype.html in headless Chromium and returns the image as a
// tool-result image block { type:'image', data, mimeType } so the model can see and critique it.
// Ports the proven render pattern from Mockups/_tooling/screenshot.js (1440px, fonts.ready, settle).
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// One browser per worker process, launched lazily, reused across screenshots.
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--hide-scrollbars", "--no-sandbox"],
    });
  }
  return browserPromise;
}

/** Close the shared browser. Call in the loop's `finally` so Chromium never leaks. */
export async function closeEyes(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  if (b) await b.close().catch(() => {});
}

/**
 * Build the Eyes MCP server bound to a run directory. The agent writes the build
 * file (`fileName` — prototype.html or deck.html) into that dir; each screenshot is
 * saved as round-N.jpg alongside a snapshot of the HTML for that round.
 */
export function createEyesServer(runDir: string, fileName: string = "prototype.html") {
  let round = 0;
  // The files written for the most recent screenshot. The gate reads these at
  // score time so each round's persisted row points at the right HTML + image.
  let lastImagePath: string | null = null;
  let lastHtmlPath: string | null = null;

  const server = createSdkMcpServer({
    name: "eyes",
    version: "1.0.0",
    // Keep the tool in-context (never deferred behind ToolSearch) — there's only one.
    alwaysLoad: true,
    tools: [
      tool(
        "screenshot",
        `Render the current ${fileName} in a headless browser at 1440px wide and return a full-page screenshot image so you can see and critique your own work. Call this after every change to the file, before scoring.`,
        {
          note: z
            .string()
            .optional()
            .describe("optional note about what you just changed and want to inspect"),
        },
        async () => {
          const file = path.join(runDir, fileName);
          if (!fs.existsSync(file)) {
            return {
              content: [
                {
                  type: "text",
                  text: `No ${fileName} exists yet in the working directory. Write the file first, then screenshot.`,
                },
              ],
              isError: true,
            };
          }

          round += 1;
          const browser = await getBrowser();
          const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 1, // 1x keeps the image well under the vision size cap
          });
          try {
            await page.goto("file:///" + file.replace(/\\/g, "/"), {
              waitUntil: "networkidle",
            });
            // let web fonts settle, mirroring the export tooling
            try {
              await page.evaluate(() => (document as any).fonts?.ready);
            } catch {
              /* ignore */
            }
            await page.waitForTimeout(400);

            const buf = await page.screenshot({ fullPage: true, type: "jpeg", quality: 85 });
            const outImg = path.join(runDir, `round-${round}.jpg`);
            fs.writeFileSync(outImg, buf);
            lastImagePath = outImg;
            const outHtml = path.join(runDir, `round-${round}.html`);
            try {
              fs.copyFileSync(file, outHtml);
              lastHtmlPath = outHtml;
            } catch {
              lastHtmlPath = null;
            }

            return {
              content: [
                {
                  type: "text",
                  text: `Screenshot of ${fileName} — round ${round}. Saved ${path.basename(outImg)}. Study the layout, hierarchy, spacing, color, density, and whether it reads as a real, finished product, then name the specific weaknesses.`,
                },
                { type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" },
              ],
            };
          } finally {
            await page.close().catch(() => {});
          }
        }
      ),
      tool(
        "interact",
        `Drive REAL clicks/typing in your current ${fileName} (headless browser) to VERIFY the key interaction works in the DOM — not just how it looks. Give the exact CSS selectors from the markup you wrote. Returns which steps hit/missed plus an after-screenshot. Use it each round to confirm the interaction before you score.`,
        {
          steps: z
            .array(
              z.object({
                action: z.enum(["click", "fill", "hover", "press"]),
                selector: z.string().describe("CSS selector (or, for press, the key e.g. 'Enter')"),
                value: z.string().optional().describe("text for fill; key for press"),
              }),
            )
            .describe("ordered interaction steps"),
          note: z.string().optional(),
        },
        async (args) => {
          const file = path.join(runDir, fileName);
          if (!fs.existsSync(file)) {
            return { content: [{ type: "text", text: `No ${fileName} yet — write it first.` }], isError: true };
          }
          const browser = await getBrowser();
          const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
          const results: string[] = [];
          try {
            await page.goto("file:///" + file.replace(/\\/g, "/"), { waitUntil: "networkidle" });
            try { await page.evaluate(() => (document as any).fonts?.ready); } catch { /* ignore */ }
            for (const [i, s] of args.steps.entries()) {
              try {
                if (s.action === "click") await page.click(s.selector, { timeout: 3000 });
                else if (s.action === "hover") await page.hover(s.selector, { timeout: 3000 });
                else if (s.action === "fill") await page.fill(s.selector, s.value ?? "", { timeout: 3000 });
                else if (s.action === "press") await page.press(s.selector || "body", s.value ?? "Enter", { timeout: 3000 });
                results.push(`✓ step ${i + 1} ${s.action} ${s.selector}`);
                await page.waitForTimeout(200);
              } catch (e) {
                results.push(`✗ step ${i + 1} ${s.action} ${s.selector} — FAILED: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
              }
            }
            await page.waitForTimeout(300);
            const buf = await page.screenshot({ fullPage: true, type: "jpeg", quality: 85 });
            return {
              content: [
                { type: "text", text: `Interaction result:\n${results.join("\n")}\n\nAfter-state screenshot below — confirm the interaction did what you intended (panel opened, badge recolored, row moved, etc.). A ✗ means that selector wasn't found — the interaction is broken; fix it.` },
                { type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" },
              ],
            };
          } finally {
            await page.close().catch(() => {});
          }
        },
      ),
    ],
  });

  return {
    server,
    getRound: () => round,
    // The HTML + screenshot files from the most recent screenshot call — used by
    // the gate to tag each score with the artifacts the agent was looking at.
    getLastArtifacts: () => ({ screenshotPath: lastImagePath, htmlPath: lastHtmlPath }),
  };
}
