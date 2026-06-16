import { CdpClient } from "../cdp-client.js";
import { logger } from "../utils/logger.js";

export interface WatchlistItem {
  symbol: string;
  description: string | null;
  lastPrice: string | null;
  change: string | null;
  changePercent: string | null;
}

export interface WatchlistDetails {
  name: string;
  items: WatchlistItem[];
}

export async function getWatchlist(cdpClient: CdpClient): Promise<WatchlistDetails> {
  logger.info("Scraping watchlist details...");
  return cdpClient.evaluate<WatchlistDetails>(`
    (() => {
      let watchlistName = "Default Watchlist";
      const items = [];

      // Find watchlist name header
      const headerEl = document.querySelector('[class*="watchlist"] [class*="listHeader"], [class*="listName"], [class*="title-"]');
      if (headerEl) {
        watchlistName = headerEl.textContent?.trim() || watchlistName;
      }

      // Find all watchlist row elements
      // Typically, rows have classes containing "row-" or "item-" under a watchlist container
      const rows = document.querySelectorAll(
        '[class*="watchlist"] [class*="row-"], ' +
        '[class*="widgetbar-page"] [class*="list-"] [class*="item-"], ' +
        '[class*="watchlist"] tr'
      );

      rows.forEach(row => {
        // Find symbol name
        const symbolEl = row.querySelector('[class*="symbolName"], [class*="symbol-name"], [class*="symbol-title"]');
        if (!symbolEl) return;

        const symbol = symbolEl.textContent?.trim() || "";
        if (!symbol) return;

        // Description
        const descEl = row.querySelector('[class*="description"], [class*="symbolDescription"]');
        const description = descEl ? descEl.textContent?.trim() || null : null;

        // Last Price
        const priceEl = row.querySelector('[class*="last-"], [class*="lastPrice"], [class*="price"]');
        const lastPrice = priceEl ? priceEl.textContent?.trim() || null : null;

        // Change & Change Percent
        const changeEl = row.querySelector('[class*="change-"], [class*="changePercent"]');
        let change = null;
        let changePercent = null;
        if (changeEl) {
          const text = changeEl.textContent?.trim() || "";
          // Usually formatted like "+1.25 (+0.45%)" or "-5.00 (-1.2%)"
          const match = text.match(/^([^\\(]+)\\s*\\(([^\\)]+)\\)/);
          if (match) {
            change = match[1].trim();
            changePercent = match[2].trim();
          } else {
            change = text;
          }
        }

        items.push({
          symbol,
          description,
          lastPrice,
          change,
          changePercent
        });
      });

      // Fallback: If no rows found with standard selectors, search for any element with data-symbol attribute
      if (items.length === 0) {
        const symbolContainers = document.querySelectorAll('[data-symbol]');
        const seenSymbols = new Set();
        symbolContainers.forEach(container => {
          const symbol = container.getAttribute('data-symbol');
          if (symbol && !seenSymbols.has(symbol)) {
            seenSymbols.add(symbol);
            items.push({
              symbol,
              description: null,
              lastPrice: null,
              change: null,
              changePercent: null
            });
          }
        });
      }

      return {
        name: watchlistName,
        items
      };
    })()
  `);
}
