import { logger } from "../utils/logger.js";
export async function getCurrentSymbol(cdpClient) {
    logger.info("Extracting current symbol...");
    return cdpClient.evaluate(`
    (() => {
      let symbol = "";
      let exchange = null;
      const title = document.title;

      // Fallback 1: Extract from document title
      // Format is usually "SYMBOL • Timeframe • Exchange — TradingView" or "SYMBOL Timeframe Chart — TradingView"
      if (title) {
        const titleParts = title.split(/[•·—–-]/).map(p => p.trim());
        if (titleParts.length > 0) {
          const firstPart = titleParts[0].split(/[\\s,]+/);
          symbol = firstPart[0];
        }
      }

      // Fallback 2: Check header-toolbar-symbol-search element
      const headerSearchEl = document.getElementById("header-toolbar-symbol-search");
      if (headerSearchEl) {
        const text = headerSearchEl.innerText || headerSearchEl.textContent || "";
        if (text.trim()) {
          symbol = text.trim();
        }
      }

      // Fallback 3: Query DOM elements that look like symbol display
      if (!symbol) {
        const symbolEl = document.querySelector('[class*="symbol-title"], [class*="symbolTitle"], [class*="symbolText"]');
        if (symbolEl) {
          symbol = symbolEl.textContent?.trim() || "";
        }
      }

      // Attempt to find exchange
      if (title) {
        const titleParts = title.split(/[•·—–-]/).map(p => p.trim());
        if (titleParts.length > 2) {
          exchange = titleParts[2];
        }
      }

      // Clean symbol (e.g. remove any indicator/timeframe stuff that leaked)
      symbol = symbol.replace(/\\s.*/, ""); // Remove anything after space

      return {
        symbol: symbol || "UNKNOWN",
        exchange: exchange,
        fullTitle: title
      };
    })()
  `);
}
export async function getCurrentTimeframe(cdpClient) {
    logger.info("Extracting current timeframe...");
    return cdpClient.evaluate(`
    (() => {
      let timeframe = "";
      let source = "unknown";

      const buttons = Array.from(
        document.querySelectorAll("button")
      );

      for (const btn of buttons) {
        const text = (btn.textContent || "").trim();

        if (/^(1|3|5|15|30|45|60|120|180|240|D|W|M|1D|1W|1M|4H)$/i.test(text)) {
          timeframe = text;
          source = "button_scan";
          break;
        }
      }

      return {
        timeframe: timeframe || "UNKNOWN",
        source
      };
    })()
  `);
}
export async function getIndicatorValues(cdpClient) {
    logger.info("Scraping indicator values...");
    return cdpClient.evaluate(`
    (() => {
      const results = [];
      // Search for legend items that represent studies or indicators
      // They typically live in classes containing "legend"
      const legendItems = document.querySelectorAll('[class*="legend-item"], [class*="legendItem"]');
      
      legendItems.forEach(item => {
        // Find title
        const titleEl = item.querySelector('[class*="title"], [class*="name"]');
        if (!titleEl) return;
        const name = titleEl.textContent?.trim() || "";
        
        // Skip main series (symbol legend) if it contains OHLC markers
        if (name.includes("O") && name.includes("H") && name.includes("L") && name.includes("C")) {
          return;
        }

        const values = {};
        // Get values and their labels
        const valueWrapper = item.querySelector('[class*="valuesWrapper"], [class*="value-wrapper"], [class*="values-"]');
        if (valueWrapper) {
          const valueTitles = valueWrapper.querySelectorAll('[class*="title"], [class*="label"]');
          const valueVals = valueWrapper.querySelectorAll('[class*="value"], [class*="val"]');
          
          if (valueVals.length > 0) {
            valueVals.forEach((valEl, idx) => {
              const label = valueTitles[idx]?.textContent?.trim() || \`val_\${idx}\`;
              const valText = valEl.textContent?.trim() || "";
              values[label] = valText;
            });
          } else {
            // Text only value format
            values["value"] = valueWrapper.textContent?.trim() || "";
          }
        } else {
          // Fallback, check all span children
          const spans = Array.from(item.querySelectorAll('span'));
          spans.forEach((span, idx) => {
            if (span.classList.value.includes("value") || span.classList.value.includes("val")) {
              values[\`val_\${idx}\`] = span.textContent?.trim() || "";
            }
          });
        }

        if (name && Object.keys(values).length > 0) {
          results.push({ name, values });
        }
      });

      return results;
    })()
  `);
}
export async function getOhlcvData(cdpClient) {
    logger.info("Fetching OHLCV data...");
    return cdpClient.evaluate(`
    (() => {
      // Method 1: Internal tradingview collections (works on client context where chart collection is exposed)
      try {
        const chartWidget = window.chartWidgetCollection?.activeChartWidget?.().value();
        if (chartWidget) {
          const mainSeries = chartWidget.model().mainSeries();
          const bars = mainSeries.data().bars();
          const list = [];
          
          // Depending on obfuscation, bars might be an array or have an internal data structure
          if (typeof bars.toArray === "function") {
            const arr = bars.toArray();
            for (let i = 0; i < arr.length; i++) {
              const bar = arr[i];
              // bar structure: value: [timestamp, open, high, low, close, volume]
              if (bar && bar.value) {
                list.push({
                  time: bar.value[0],
                  open: bar.value[1],
                  high: bar.value[2],
                  low: bar.value[3],
                  close: bar.value[4],
                  volume: bar.value[5] || 0
                });
              }
            }
          } else if (typeof bars.each === "function") {
            bars.each((index, bar) => {
              if (bar && bar.value) {
                list.push({
                  time: bar.value[0],
                  open: bar.value[1],
                  high: bar.value[2],
                  low: bar.value[3],
                  close: bar.value[4],
                  volume: bar.value[5] || 0
                });
              }
            });
          }
          
          if (list.length > 0) {
            return list;
          }
        }
      } catch (err) {
        // Fall through to legend scraping
      }

      // Method 2: Scrape current bar values from the main legend as a fallback
      try {
        const legendItem = document.querySelector('[class*="legend-item"]');
        if (legendItem) {
          // Parse OHLC values
          const findValue = (label) => {
            const spans = Array.from(legendItem.querySelectorAll('span'));
            for (let i = 0; i < spans.length; i++) {
              if (spans[i].textContent?.trim() === label && i + 1 < spans.length) {
                return parseFloat(spans[i+1].textContent?.trim() || "0");
              }
            }
            // Alternative layout class selectors
            const labelEl = Array.from(legendItem.querySelectorAll('[class*="value-"]')).find(
              el => el.previousElementSibling?.textContent?.trim() === label
            );
            return labelEl ? parseFloat(labelEl.textContent?.trim() || "0") : 0;
          };

          const open = findValue("O");
          const high = findValue("H");
          const low = findValue("L");
          const close = findValue("C");
          const volumeText = legendItem.querySelector('[class*="volume"]')?.textContent || "0";
          
          // Parse volume (e.g. 1.2M, 500K, etc.)
          let volume = parseFloat(volumeText.replace(/[KMB]/g, ""));
          if (volumeText.includes("K")) volume *= 1000;
          if (volumeText.includes("M")) volume *= 1000000;
          if (volumeText.includes("B")) volume *= 1000000000;

          return [{
            time: Date.now(),
            open,
            high,
            low,
            close,
            volume: isNaN(volume) ? 0 : volume
          }];
        }
      } catch (err) {
        // Final fallback empty array
      }

      return [];
    })()
  `);
}
