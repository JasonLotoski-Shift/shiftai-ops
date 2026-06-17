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
 * Build the Eyes MCP server bound to a run directory. The agent writes
 * `prototype.html` into that dir; each screenshot is saved as round-N.jpg alongside
 * a snapshot of the HTML for that round.
 */
export function createEyesServer(runDir: string) {
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
        "Render the current prototype.html in a headless browser at 1440px wide and return a full-page screenshot image so you can see and critique your own work. Call this after every change to the file, before scoring.",
        {
          note: z
            .string()
            .optional()
            .describe("optional note about what you just changed and want to inspect"),
        },
        async () => {
          const file = path.join(runDir, "prototype.html");
          if (!fs.existsSync(file)) {
            return {
              content: [
                {
                  type: "text",
                  text: "No prototype.html exists yet in the working directory. Write the file first, then screenshot.",
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
                  text: `Screenshot of prototype.html — round ${round}. Saved ${path.basename(outImg)}. Study the layout, hierarchy, spacing, color, density, and whether the tabs and key interaction read as a real product, then name the specific weaknesses.`,
                },
                { type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" },
              ],
            };
          } finally {
            await page.close().catch(() => {});
          }
        }
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
