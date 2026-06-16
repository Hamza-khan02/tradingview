# TradingView Desktop MCP Server

A production-ready Model Context Protocol (MCP) server that connects Claude Desktop to TradingView Desktop via Chrome DevTools Protocol (CDP), allowing Claude to control, scrape, and capture chart data directly.

## Features

- **Get Symbol & Timeframe**: Extract details with robust DOM and document title fallbacks.
- **Change Symbol & Timeframe**: Dispatch keyboard event sequences mimicking direct user interaction.
- **Export OHLCV**: Export current and historical bar data from chart widget context.
- **Scrape Indicator Values**: Read values for any indicator/study printed in pane legends.
- **Read Watchlists**: Capture tickers, descriptions, last prices, and change percentages.
- **Manage Alerts**: Create, list, and delete price alerts programmatically using UI automation.
- **Capture Screenshots**: High-resolution PNG captures directly from the Chromium canvas surface.
- **Auto-Reconnect**: Seamless WebSocket reconnection when TradingView Desktop is closed or restarted.

## Prerequisites

1. **Node.js**: Version 18.0.0 or higher.
2. **TradingView Desktop**: Launched with remote debugging enabled.

To launch TradingView Desktop with the remote debugging port active, run the following command in terminal or update your application shortcut properties:

```cmd
TradingView.exe --remote-debugging-port=9222
```

Ensure you verify this is active by opening a browser and navigating to `http://localhost:9222/json`. You should see a JSON list of available pages and tabs.

## Installation & Setup

1. Clone or copy this repository to your local directory (e.g. `C:\Users\hamza\OneDrive\Desktop\ye`).
2. Install dependencies:
   ```bash
   npm install
   ```

## Building

Compile the TypeScript source code into ES Modules under the `/build` directory:
```bash
npm run build
```

## Running Tests

Run the full unit and integration test suite using Vitest (which tests components against an emulated TradingView CDP server):
```bash
npm run test
```

## Claude Desktop Configuration

To connect this server to Claude Desktop, edit your `claude_desktop_config.json` configuration file:

- **Windows path**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS path**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the following configuration configuration block:

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": [
        "C:/Users/hamza/OneDrive/Desktop/ye/build/index.js"
      ],
      "env": {
        "TRADINGVIEW_DEBUG_PORT": "9222",
        "TRADINGVIEW_DEBUG_HOST": "127.0.0.1",
        "CDP_TIMEOUT_MS": "10000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Make sure the path in the `args` array points to the absolute location of your compiled `/build/index.js` file, using forward slashes (`/`) even on Windows.

Restart Claude Desktop after updating this file.

## Exposed MCP Tools

### `get_current_symbol`
Retrieves symbol name and exchange details from the active chart tab.

### `get_current_timeframe`
Reads the chart timeframe interval (e.g., 5, 1D, 1W) from active chart headers.

### `get_chart_screenshot`
Returns a high-resolution PNG image of the current TradingView chart layout (Base64).

### `get_watchlist`
Scrapes active watchlist names and lists all assets including current price data.

### `get_indicator_values`
Extracts study title and numeric output values for all indicators active on the pane legends.

### `get_chart_layout`
Returns structural metadata of the screen dimensions, active grid index, and viewport sizes.

### `get_ohlcv_data`
Extracts historical OHLCV data array (time, open, high, low, close, volume) from chart.

### `change_symbol`
- Arguments: `symbol` (string)
Types ticker name on the chart and confirms choice.

### `change_timeframe`
- Arguments: `timeframe` (string)
Types interval notation on the chart and confirms choice.

### `refresh_chart`
Triggers cache reload of the TradingView canvas environment.

### `create_alert`
- Arguments: `price` (number), `name` (string, optional), `message` (string, optional)
Triggers Alt+A dialog, enters conditions, and submits creation.

### `list_alerts`
Expands the right-sidebar Alerts panel and lists all scheduled alerts.

### `delete_alert`
- Arguments: `index` (number)
Finds the alert at the index list row and executes removal actions.

## Troubleshooting

### "TradingView Desktop remote debugging is disconnected..."
Ensure TradingView Desktop was launched with the `--remote-debugging-port=9222` flag. Verify that visiting `http://localhost:9222/json` in your browser works and displays the targets.

### Tool timeout errors
If standard commands time out (especially UI macros like `create_alert` or `change_symbol` under heavy chart load), increase the timeout threshold in the config environment options (`CDP_TIMEOUT_MS`).

### Claude Desktop connection crashes
Look for issues in your configuration path, compile script success, or check the logs by running:
```bash
tail -f "%APPDATA%\Claude\logs\mcp.log"
```
The server routes logging output cleanly to `stderr` (`LOG_LEVEL=info` by default), preventing stdout data corruption.
