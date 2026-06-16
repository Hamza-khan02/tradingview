import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MockTradingViewServer } from "./mock-tradingview.js";
import { CdpClient } from "../src/cdp-client.js";
import { getCurrentSymbol, getCurrentTimeframe, getIndicatorValues, getOhlcvData } from "../src/tools/data.js";
import { getWatchlist } from "../src/tools/watchlist.js";
import { getChartScreenshot, changeSymbol, changeTimeframe } from "../src/tools/chart.js";
import { createAlert, listAlerts, deleteAlert } from "../src/tools/alert.js";

const PORT = 9223;

describe("TradingView MCP Integration", () => {
  let mockServer: MockTradingViewServer;
  let client: CdpClient;

  beforeAll(async () => {
    // Override environment variables to point to mock server
    process.env.TRADINGVIEW_DEBUG_HOST = "localhost";
    process.env.TRADINGVIEW_DEBUG_PORT = String(PORT);
    process.env.CDP_TIMEOUT_MS = "2000";

    mockServer = new MockTradingViewServer(PORT);
    await mockServer.start();

    client = new CdpClient();
    await client.connect();
  });

  afterAll(async () => {
    client.disconnect();
    await mockServer.stop();
  });

  it("should retrieve current symbol information", async () => {
    const symbolDetails = await getCurrentSymbol(client);
    expect(symbolDetails.symbol).toBe("AAPL");
    expect(symbolDetails.exchange).toBe("NASDAQ");
  });

  it("should retrieve current timeframe details", async () => {
    const tfDetails = await getCurrentTimeframe(client);
    expect(tfDetails.timeframe).toBe("1D");
  });

  it("should capture page screenshots", async () => {
    const { base64Image } = await getChartScreenshot(client);
    expect(base64Image).toBeDefined();
    expect(base64Image.length).toBeGreaterThan(10);
  });

  it("should retrieve watchlist symbols", async () => {
    const watchlist = await getWatchlist(client);
    expect(watchlist.name).toBe("Tech Watchlist");
    expect(watchlist.items.length).toBe(2);
    expect(watchlist.items[0].symbol).toBe("AAPL");
    expect(watchlist.items[1].symbol).toBe("MSFT");
  });

  it("should extract indicator values", async () => {
    const indicators = await getIndicatorValues(client);
    expect(indicators.length).toBe(2);
    expect(indicators[0].name).toBe("RSI (14, close)");
    expect(indicators[0].values["RSI"]).toBe("55.23");
  });

  it("should export historical OHLCV data series", async () => {
    const ohlcv = await getOhlcvData(client);
    expect(ohlcv.length).toBe(1);
    expect(ohlcv[0].close).toBe(181.4);
    expect(ohlcv[0].volume).toBe(52000000);
  });

  it("should change chart symbol", async () => {
    const result = await changeSymbol(client, "MSFT");
    expect(result.success).toBe(true);
  });

  it("should change chart timeframe", async () => {
    const result = await changeTimeframe(client, "5");
    expect(result.success).toBe(true);
  });

  it("should execute create alert automation", async () => {
    const result = await createAlert(client, { price: 185.0 });
    expect(result.success).toBe(true);
  });

  it("should list active alerts configurations", async () => {
    const list = await listAlerts(client);
    expect(list.length).toBe(1);
    expect(list[0].symbol).toBe("AAPL");
  });

  it("should execute delete alert action", async () => {
    const result = await deleteAlert(client, 0);
    expect(result.success).toBe(true);
  });
});
