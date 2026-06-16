import { logger } from "../utils/logger.js";
/**
 * Sends Alt+A to open the Create Alert dialog
 */
async function openAlertDialog(cdpClient) {
    logger.info("Opening 'Create Alert' dialog via Alt+A shortcut...");
    // Alt modifier = 1
    await cdpClient.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers: 1, // Alt modifier
        text: "a",
        unmodifiedText: "a",
    });
    await cdpClient.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers: 1,
    });
    // Small delay for the dialog to load
    await new Promise((resolve) => setTimeout(resolve, 600));
}
export async function createAlert(cdpClient, params) {
    logger.info(`Creating alert at price: ${params.price}`);
    // 1. Trigger the dialog open
    await openAlertDialog(cdpClient);
    // 2. Automate the fields inside the open dialog
    const result = await cdpClient.evaluate(`
    (() => {
      // Find the alert dialog container
      const dialog = document.querySelector('[data-name="create-alert-dialog"], [class*="dialog-"], div[class*="popup"]');
      if (!dialog) {
        return { success: false, message: "Create Alert dialog not found in the DOM." };
      }

      // Find value/price inputs (usually type="number" or has value/price class)
      const inputs = Array.from(dialog.querySelectorAll('input'));
      const priceInput = inputs.find(i => 
        i.type === "number" || 
        i.name === "value" || 
        i.classList.value.toLowerCase().includes("price") ||
        i.classList.value.toLowerCase().includes("value")
      );

      if (!priceInput) {
        return { success: false, message: "Price/Value input field not found in the alert dialog." };
      }

      // Enter the price
      priceInput.focus();
      priceInput.value = "${params.price}";
      
      // Trigger input events so the React state updates
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.dispatchEvent(new Event('change', { bubbles: true }));

      // Optional Alert Name
      if ("${params.name || ""}") {
        const nameInput = inputs.find(i => 
          i.type === "text" && 
          (i.name?.toLowerCase().includes("name") || i.placeholder?.toLowerCase().includes("name"))
        );
        if (nameInput) {
          nameInput.focus();
          nameInput.value = "${params.name || ""}";
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Optional Alert Message
      if ("${params.message || ""}") {
        const textareas = Array.from(dialog.querySelectorAll('textarea'));
        const msgTextarea = textareas.find(t => 
          t.name?.toLowerCase().includes("message") || t.placeholder?.toLowerCase().includes("message")
        ) || textareas[0];
        
        if (msgTextarea) {
          msgTextarea.focus();
          msgTextarea.value = "${params.message || ""}";
          msgTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          msgTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Find the Create button
      const buttons = Array.from(dialog.querySelectorAll('button'));
      const createButton = buttons.find(b => 
        b.textContent?.trim().toLowerCase() === "create" || 
        b.getAttribute('data-name') === "submit" ||
        b.classList.value.toLowerCase().includes("create")
      );

      if (!createButton) {
        return { success: false, message: "Create button not found in the dialog." };
      }

      // Click create
      createButton.click();
      return { success: true, message: "Successfully filled and clicked Create." };
    })()
  `);
    return result;
}
export async function listAlerts(cdpClient) {
    logger.info("Listing active alerts from the sidebar...");
    // Open the Alerts sidebar first
    await cdpClient.evaluate(`
    (() => {
      // Find Alerts tab button in right bar
      const alertsTabBtn = document.querySelector('button[data-name="alerts"], button[title*="Alerts"], [class*="widgetbar"] button[title*="bell"]');
      if (alertsTabBtn && !alertsTabBtn.classList.value.includes("isActive")) {
        alertsTabBtn.click();
      }
    })()
  `);
    // Wait for sidebar animation
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Scrape list items
    return cdpClient.evaluate(`
    (() => {
      const list = [];
      // Search for items in the alerts list panel
      const alertItems = document.querySelectorAll(
        '[class*="alerts-list"] [class*="item-"], ' +
        '[class*="widgetbar-page"] [class*="alert"] [class*="item-"], ' +
        '[class*="alerts-"] [class*="row-"]'
      );

      alertItems.forEach((item, index) => {
        const symbolEl = item.querySelector('[class*="symbol"], [class*="title"]');
        const conditionEl = item.querySelector('[class*="condition"], [class*="description"]');
        const statusEl = item.querySelector('[class*="status"], [class*="state"]');

        if (symbolEl) {
          list.push({
            index,
            symbol: symbolEl.textContent?.trim() || "Unknown",
            condition: conditionEl?.textContent?.trim() || "Unknown",
            status: statusEl?.textContent?.trim() || "Active"
          });
        }
      });

      return list;
    })()
  `);
}
export async function deleteAlert(cdpClient, index) {
    logger.info(`Deleting alert at index: ${index}`);
    // Open sidebar if closed
    await cdpClient.evaluate(`
    (() => {
      const alertsTabBtn = document.querySelector('button[data-name="alerts"], button[title*="Alerts"]');
      if (alertsTabBtn && !alertsTabBtn.classList.value.includes("isActive")) {
        alertsTabBtn.click();
      }
    })()
  `);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Click delete button of the alert at index
    const result = await cdpClient.evaluate(`
    (() => {
      const alertItems = document.querySelectorAll(
        '[class*="alerts-list"] [class*="item-"], ' +
        '[class*="widgetbar-page"] [class*="alert"] [class*="item-"], ' +
        '[class*="alerts-"] [class*="row-"]'
      );

      const target = alertItems[${index}];
      if (!target) {
        return { success: false, message: "Alert at index ${index} not found." };
      }

      // Hovering or directly clicking the remove button
      // Remove buttons usually have data-name="remove", or contain "close" or "delete" class, or look like an "X" icon
      const deleteBtn = target.querySelector('button[data-name="remove"], [class*="remove"], [class*="delete"], [class*="close"]');
      if (!deleteBtn) {
        return { success: false, message: "Delete/Remove button not found on the alert item." };
      }

      // Click delete button
      deleteBtn.click();

      // Sometimes a confirmation popup appears
      setTimeout(() => {
        const confirmBtn = document.querySelector('button[data-name="yes"], button[class*="ok"], button[class*="confirm"]');
        if (confirmBtn) {
          confirmBtn.click();
        }
      }, 300);

      return { success: true, message: "Delete command triggered." };
    })()
  `);
    return result;
}
