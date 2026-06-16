import http from "http";
import WebSocket from "ws";
import { logger } from "./utils/logger.js";
export class CdpClient {
    ws = null;
    requestId = 0;
    pendingRequests = new Map();
    host;
    port;
    timeoutMs;
    reconnectTimer = null;
    isConnecting = false;
    onDisconnect = null;
    onConnect = null;
    constructor() {
        this.host = process.env.TRADINGVIEW_DEBUG_HOST || "127.0.0.1";
        this.port = parseInt(process.env.TRADINGVIEW_DEBUG_PORT || "9222", 10);
        this.timeoutMs = parseInt(process.env.CDP_TIMEOUT_MS || "10000", 10);
    }
    /**
     * Discovers the TradingView chart target from http://host:port/json
     */
    async discoverTarget() {
        return new Promise((resolve, reject) => {
            const url = `http://${this.host}:${this.port}/json`;
            logger.debug(`Discovering targets at ${url}`);
            const req = http.get(url, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Failed to list targets. Status: ${res.statusCode}`));
                        return;
                    }
                    try {
                        const targets = JSON.parse(data);
                        // Search for TradingView pages
                        const tvTarget = targets.find((t) => t.type === "page" &&
                            (t.url.includes("tradingview.com") ||
                                t.title.toLowerCase().includes("tradingview") ||
                                t.title.toLowerCase().includes("chart")));
                        if (!tvTarget) {
                            reject(new Error("TradingView tab/page not found in targets."));
                            return;
                        }
                        if (!tvTarget.webSocketDebuggerUrl) {
                            reject(new Error("Target found, but webSocketDebuggerUrl is missing."));
                            return;
                        }
                        resolve(tvTarget);
                    }
                    catch (err) {
                        reject(new Error(`Failed to parse target JSON: ${err.message}`));
                    }
                });
            });
            req.on("error", (err) => {
                reject(new Error(`Failed to connect to TradingView debug port: ${err.message}`));
            });
            req.end();
        });
    }
    /**
     * Connects to the discovered TradingView websocket
     */
    async connect() {
        if (this.ws || this.isConnecting) {
            return;
        }
        this.isConnecting = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        try {
            const target = await this.discoverTarget();
            logger.info(`Connecting to TradingView target: ${target.title} (${target.url})`);
            return new Promise((resolve, reject) => {
                const wsUrl = target.webSocketDebuggerUrl;
                const ws = new WebSocket(wsUrl);
                ws.on("open", async () => {
                    this.ws = ws;
                    this.isConnecting = false;
                    logger.info("Connected to TradingView via Chrome DevTools Protocol");
                    try {
                        // Enable Runtime, Page, and Input domains
                        await this.send("Runtime.enable");
                        await this.send("Page.enable");
                        if (this.onConnect) {
                            this.onConnect();
                        }
                        resolve();
                    }
                    catch (err) {
                        this.disconnect();
                        reject(err);
                    }
                });
                ws.on("message", (data) => {
                    this.handleMessage(data.toString());
                });
                ws.on("error", (err) => {
                    logger.error(`WebSocket error: ${err.message}`);
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        reject(err);
                    }
                });
                ws.on("close", () => {
                    logger.warn("WebSocket connection closed");
                    this.handleDisconnect();
                });
            });
        }
        catch (err) {
            this.isConnecting = false;
            logger.error(`Failed to connect: ${err.message}`);
            this.scheduleReconnect();
            throw err;
        }
    }
    handleDisconnect() {
        this.ws = null;
        // Reject all pending requests
        for (const [id, req] of this.pendingRequests.entries()) {
            clearTimeout(req.timeoutId);
            req.reject(new Error("Connection closed."));
            this.pendingRequests.delete(id);
        }
        if (this.onDisconnect) {
            this.onDisconnect();
        }
        this.scheduleReconnect();
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        logger.info("Scheduling reconnection in 5 seconds...");
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.connect();
            }
            catch (err) {
                // Reconnect scheduled again automatically by connect() catch
            }
        }, 5000);
    }
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
    /**
     * Sends a Chrome DevTools Protocol command
     */
    async send(method, params) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("Cannot send command, CDP client is not connected.");
        }
        const id = ++this.requestId;
        const payload = JSON.stringify({ id, method, params });
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Command ${method} (id: ${id}) timed out after ${this.timeoutMs}ms`));
            }, this.timeoutMs);
            this.pendingRequests.set(id, {
                resolve: (val) => {
                    clearTimeout(timeoutId);
                    resolve(val);
                },
                reject: (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                },
                timeoutId,
            });
            this.ws.send(payload, (err) => {
                if (err) {
                    this.pendingRequests.delete(id);
                    clearTimeout(timeoutId);
                    reject(err);
                }
            });
        });
    }
    /**
     * Evaluates JavaScript on the TradingView page
     */
    async evaluate(expression) {
        const response = await this.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (response.exceptionDetails) {
            const desc = response.exceptionDetails.exception?.description || "Unknown JS Error";
            throw new Error(`Javascript execution failed: ${desc}`);
        }
        return response.result?.value;
    }
    /**
     * Handles incoming WebSocket messages
     */
    handleMessage(data) {
        try {
            const msg = JSON.parse(data);
            if (msg.id !== undefined) {
                const pending = this.pendingRequests.get(msg.id);
                if (pending) {
                    this.pendingRequests.delete(msg.id);
                    if (msg.error) {
                        pending.reject(new Error(`CDP Error ${msg.error.code}: ${msg.error.message}`));
                    }
                    else {
                        pending.resolve(msg.result);
                    }
                }
            }
        }
        catch (err) {
            logger.error(`Failed to parse WebSocket message: ${err.message}`);
        }
    }
}
