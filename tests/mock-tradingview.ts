import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "../src/utils/logger.js";

export class MockTradingViewServer {
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private port: number;

  constructor(port = 9223) {
    this.port = port;
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      // 1. HTTP Server for /json discovery
      this.httpServer = http.createServer((req, res) => {
        if (req.url === "/json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify([
              {
                description: "Mock Page",
                devtoolsFrontendUrl: `http://localhost:${this.port}/devtools/inspector.html`,
                id: "mock-id-1234",
                title: "AAPL 1D Chart — TradingView",
                type: "page",
                url: "https://www.tradingview.com/chart/mocked/",
                webSocketDebuggerUrl: `ws://localhost:${this.port}/devtools/page/mock-id-1234`,
              },
            ])
          );
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      // 2. WS Server for Chrome DevTools Protocol emulation
      this.wss = new WebSocketServer({ noServer: true });

      this.httpServer.on("upgrade", (request, socket, head) => {
        if (request.url?.startsWith("/devtools/page/mock-id-1234")) {
          this.wss?.handleUpgrade(request, socket, head, (ws) => {
            this.wss?.emit("connection", ws, request);
          });
        } else {
          socket.destroy();
        }
      });

      this.wss.on("connection", (ws: WebSocket) => {
        logger.info("Mock TV: CDP client connected via WS");

        ws.on("message", (message) => {
          try {
            const rawData = message.toString();
            const { id, method, params } = JSON.parse(rawData);

            logger.debug(`Mock TV: Received request id ${id}, method ${method}`);

            let result: unknown = {};

            if (method === "Runtime.evaluate") {
              const expression = params.expression as string;
              result = this.handleEvaluate(expression);
            } else if (method === "Page.captureScreenshot") {
              result = { data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }; // 1x1 png
            } else if (method === "Input.dispatchKeyEvent") {
              result = {};
            } else if (method.endsWith(".enable")) {
              result = {};
            }

            ws.send(JSON.stringify({ id, result }));
          } catch (err) {
            logger.error(`Mock TV Error: ${(err as Error).message}`);
          }
        });
      });

      this.httpServer.listen(this.port, () => {
        logger.info(`Mock TradingView Server started on port ${this.port}`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close();
      }
      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.info("Mock TradingView Server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleEvaluate(expression: string): { result: { value: unknown } } {
    let value: unknown = null;

    if (expression.includes("header-toolbar-symbol-search")) {
      value = {
        symbol: "AAPL",
        exchange: "NASDAQ",
        fullTitle: "AAPL 1D Chart — TradingView",
      };
    } else if (expression.includes("header-toolbar-intervals") || expression.includes("title_separator")) {
      value = { timeframe: "1D", source: "title_separator" };
    } else if (expression.includes("valuesWrapper")) {
      value = [
        { name: "RSI (14, close)", values: { RSI: "55.23" } },
        { name: "EMA (9, close)", values: { EMA: "182.40" } },
      ];
    } else if (expression.includes("listHeader") || expression.includes("watchlist")) {
      value = {
        name: "Tech Watchlist",
        items: [
          { symbol: "AAPL", description: "Apple Inc.", lastPrice: "181.40", change: "+1.25", changePercent: "+0.69%" },
          { symbol: "MSFT", description: "Microsoft Corp.", lastPrice: "420.50", change: "-2.10", changePercent: "-0.50%" },
        ],
      };
    } else if (expression.includes("create-alert-dialog")) {
      value = { success: true, message: "Successfully filled and clicked Create." };
    } else if (expression.includes("alertItems[")) {
      value = { success: true, message: "Delete command triggered." };
    } else if (expression.includes("alerts-list") || expression.includes("alertsTabBtn")) {
      value = [
        { index: 0, symbol: "AAPL", condition: "Crossing 185.00", status: "Active" },
      ];
    } else if (expression.includes("chartWidgetCollection") || expression.includes("bars")) {
      value = [
        { time: 1718500000000, open: 180.0, high: 182.5, low: 179.2, close: 181.4, volume: 52000000 },
      ];
    } else if (expression.includes("chartContainers")) {
      value = {
        title: "AAPL 1D Chart — TradingView",
        url: "https://www.tradingview.com/chart/mocked/",
        chartsCount: 1,
        activeChartIndex: 0,
        viewportWidth: 1920,
        viewportHeight: 1080,
        layoutType: "single"
      };
    } else if (expression.includes("document.title")) {
      // Fallback for general title queries
      value = "AAPL 1D Chart — TradingView";
    }

    return { result: { value } };
  }
}
