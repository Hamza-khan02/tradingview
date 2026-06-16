import { CdpClient } from "../cdp-client.js";
import { KeySender } from "../utils/key-sender.js";
import { logger } from "../utils/logger.js";

/**
 * Exposes tools for modifying and reading chart configurations
 */

export async function changeSymbol(cdpClient: CdpClient, symbol: string): Promise<{ success: boolean; message: string }> {
  logger.info(`Changing symbol to: ${symbol}`);
  const keySender = new KeySender(cdpClient.send.bind(cdpClient));

  // Focus the chart container first by evaluating a click/focus on chart widget, or just send keys directly
  await cdpClient.evaluate(`
    const el = document.querySelector('.chart-container') || document.body;
    el.focus?.() || el.click?.();
  `);

  // Wait a small bit before typing
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Type symbol (TradingView opens search window on any alphanumeric key)
  await keySender.typeString(symbol, 40);

  // Wait for search box to register input
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Press Enter to confirm selection
  await keySender.pressKey("Enter");

  return {
    success: true,
    message: `Symbol change command dispatched for '${symbol}'.`,
  };
}

export async function changeTimeframe(
  cdpClient: CdpClient,
  timeframe: string
): Promise<{ success: boolean; message: string }> {
  logger.info(`Changing timeframe to: ${timeframe}`);

  const result = await cdpClient.evaluate(`
    (() => {
      const targetText = "${'${timeframe}'}".toLowerCase();

      // Open timeframe dropdown
      const buttons = Array.from(document.querySelectorAll("button"));

      const timeframeButton = buttons.find(btn => {
        const txt = (btn.textContent || "").trim().toLowerCase();
        return txt.match(/^\\d+[smhdw]$/) ||
              txt.includes("minute") ||
              txt.includes("hour") ||
              txt.includes("day");
      });

      if (timeframeButton) {
        timeframeButton.click();
      }

      return { opened: !!timeframeButton };
    })()
  `);

  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    success: true,
    message: `Attempted to open timeframe menu for ${timeframe}`,
  };
}

export async function refreshChart(cdpClient: CdpClient): Promise<{ success: boolean; message: string }> {
  logger.info("Refreshing TradingView page...");
  await cdpClient.send("Page.reload", { ignoreCache: true });
  return {
    success: true,
    message: "Page reload command executed successfully.",
  };
}

export async function getChartScreenshot(cdpClient: CdpClient): Promise<{ base64Image: string }> {
  logger.info("Capturing TradingView screenshot...");
  const response = await cdpClient.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });

  if (!response.data) {
    throw new Error("Page.captureScreenshot response did not contain image data.");
  }

  return {
    base64Image: response.data,
  };
}

export interface ChartLayoutDetails {
  title: string;
  url: string;
  chartsCount: number;
  activeChartIndex: number;
  viewportWidth: number;
  viewportHeight: number;
  layoutType: string;
}

export async function getChartLayout(cdpClient: CdpClient): Promise<any> {
  logger.info("Extracting chart layout...");

  return cdpClient.evaluate(`
    (() => {
      const chartContainers = document.querySelectorAll(
        '[class*="chart-container"], .chart-markup-table'
      );

      const activeContainers = document.querySelectorAll(
        '[class*="chart-container"].active, [class*="chart-container"] [class*="isActive"]'
      );

      let layoutType = "single";

      const multiChartContainer = document.querySelector(
        '[class*="multi-chart-container"]'
      );

      if (multiChartContainer) {
        const classes = Array.from(multiChartContainer.classList).join(" ");
        const match = classes.match(/layout-(\\w+)/);

        if (match) {
          layoutType = match[1];
        }
      }

      return {
        title: document.title,
        url: window.location.href,
        chartsCount: chartContainers.length || 1,
        activeChartIndex: activeContainers.length
          ? Array.from(chartContainers).indexOf(activeContainers[0])
          : 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        layoutType
      };
    })()
  `);
}
