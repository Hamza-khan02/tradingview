import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CdpClient } from "./cdp-client.js";
import { logger } from "./utils/logger.js";
import {
  changeSymbol,
  changeTimeframe,
  refreshChart,
  getChartScreenshot,
  getChartLayout,
} from "./tools/chart.js";
import {
  getCurrentSymbol,
  getCurrentTimeframe,
  getIndicatorValues,
  getOhlcvData,
} from "./tools/data.js";
import { getWatchlist } from "./tools/watchlist.js";
import { createAlert, listAlerts, deleteAlert } from "./tools/alert.js";

// Initialize CDP Client
const cdpClient = new CdpClient();

// Create MCP Server
const server = new Server(
  {
    name: "tradingview-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define validation schemas
const ChangeSymbolSchema = z.object({
  symbol: z.string().min(1).describe("The ticker symbol to load (e.g. AAPL, BTCUSD)"),
});

const ChangeTimeframeSchema = z.object({
  timeframe: z.string().min(1).describe("The timeframe interval to load (e.g. 5, 1D, 1W)"),
});

const CreateAlertSchema = z.object({
  price: z.number().positive().describe("The trigger price for the alert"),
  name: z.string().optional().describe("Optional alert label"),
  message: z.string().optional().describe("Optional notification message"),
});

const DeleteAlertSchema = z.object({
  index: z.number().int().nonnegative().describe("The index of the alert to delete in the list"),
});

// Register List Tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug("Received list tools request");
  return {
    tools: [
      {
        name: "get_current_symbol",
        description: "Retrieves the currently loaded ticker symbol from the active TradingView chart.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_current_timeframe",
        description: "Retrieves the active timeframe interval from the active TradingView chart.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_chart_screenshot",
        description: "Captures a high-resolution PNG screenshot of the current TradingView chart layout.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_watchlist",
        description: "Retrieves the active watchlist details including symbol names, prices, and changes.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_indicator_values",
        description: "Scrapes the values of all active studies and indicators currently displayed on the chart pane legends.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_chart_layout",
        description: "Retrieves structural metadata about the chart grid, viewport sizes, and layout configurations.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_ohlcv_data",
        description: "Exports historical OHLCV (Open, High, Low, Close, Volume) data series currently loaded in the chart.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "change_symbol",
        description: "Changes the chart ticker symbol by dispatching keyboard input commands.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "The ticker symbol (e.g. AAPL, BTCUSD)" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "change_timeframe",
        description: "Changes the chart timeframe interval by dispatching keyboard input commands.",
        inputSchema: {
          type: "object",
          properties: {
            timeframe: { type: "string", description: "The timeframe interval (e.g. 5, 1D, 1W)" },
          },
          required: ["timeframe"],
        },
      },
      {
        name: "refresh_chart",
        description: "Forces a clean cache reload of the active TradingView page layout.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "create_alert",
        description: "Dispatches keyboard macros to trigger the Create Alert popup and schedules a price alert.",
        inputSchema: {
          type: "object",
          properties: {
            price: { type: "number", description: "The trigger price" },
            name: { type: "string", description: "Optional alert label" },
            message: { type: "string", description: "Optional notification message" },
          },
          required: ["price"],
        },
      },
      {
        name: "list_alerts",
        description: "Opens the Alerts panel and lists active and scheduled alert configurations.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "delete_alert",
        description: "Locates and triggers the delete button for an active alert at the specified index list.",
        inputSchema: {
          type: "object",
          properties: {
            index: { type: "number", description: "The list index of the alert" },
          },
          required: ["index"],
        },
      },
    ],
  };
});

// Register Tool Call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info(`Handling tool call: ${name}`);

  // Helper to ensure CDP is connected
  const ensureConnected = () => {
    if (!cdpClient.isConnected()) {
      throw new Error(
        "TradingView Desktop remote debugging is disconnected. " +
          "Please verify TradingView is running with '--remote-debugging-port=9222' configured."
      );
    }
  };

  try {
    switch (name) {
      case "get_current_symbol": {
        ensureConnected();
        const data = await getCurrentSymbol(cdpClient);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_current_timeframe": {
        ensureConnected();
        const data = await getCurrentTimeframe(cdpClient);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_chart_screenshot": {
        ensureConnected();
        const { base64Image } = await getChartScreenshot(cdpClient);
        return {
          content: [
            {
              type: "image",
              data: base64Image,
              mimeType: "image/png",
            },
          ],
        };
      }

      case "get_watchlist": {
        ensureConnected();
        const data = await getWatchlist(cdpClient);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_indicator_values": {
        ensureConnected();
        const data = await getIndicatorValues(cdpClient);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_chart_layout": {
        ensureConnected();
        const data = await getChartLayout(cdpClient);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_ohlcv_data": {
        ensureConnected();
        const data = await getOhlcvData(cdpClient);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "change_symbol": {
        ensureConnected();
        const { symbol } = ChangeSymbolSchema.parse(args);
        const data = await changeSymbol(cdpClient, symbol);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "change_timeframe": {
        ensureConnected();
        const { timeframe } = ChangeTimeframeSchema.parse(args);
        const data = await changeTimeframe(cdpClient, timeframe);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "refresh_chart": {
        ensureConnected();
        const data = await refreshChart(cdpClient);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "create_alert": {
        ensureConnected();
        const validated = CreateAlertSchema.parse(args);
        const data = await createAlert(cdpClient, validated);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "list_alerts": {
        ensureConnected();
        const data = await listAlerts(cdpClient);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "delete_alert": {
        ensureConnected();
        const { index } = DeleteAlertSchema.parse(args);
        const data = await deleteAlert(cdpClient, index);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (err) {
    logger.error(`Error executing tool ${name}: ${(err as Error).message}`);
    return {
      isError: true,
      content: [{ type: "text", text: (err as Error).message }],
    };
  }
});

// Setup clean process exit signals
const cleanup = () => {
  logger.info("Shutting down MCP server...");
  cdpClient.disconnect();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Run the MCP server over stdio transport
const runServer = async () => {
  logger.info("Starting TradingView MCP server...");
  
  // Connect to TradingView asynchronously (it will retry automatically in the background if TV isn't open)
  cdpClient.connect().catch((err) => {
    logger.warn(`Initial connection failed: ${err.message}. Server is listening and will auto-reconnect.`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP Server successfully bound to Stdio transport.");
};

runServer().catch((err) => {
  logger.error(`Fatal crash in runServer: ${(err as Error).message}`);
  process.exit(1);
});
