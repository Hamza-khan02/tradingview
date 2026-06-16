import { logger } from "./logger.js";

export interface KeyDefinition {
  key: string;
  code: string;
  keyCode: number;
  shift?: boolean;
}

const KEY_MAP: Record<string, KeyDefinition> = {
  // Letters
  ...Object.fromEntries(
    Array.from("abcdefghijklmnopqrstuvwxyz").map((char) => [
      char,
      { key: char, code: `Key${char.toUpperCase()}`, keyCode: char.charCodeAt(0) - 32 },
    ])
  ),
  ...Object.fromEntries(
    Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").map((char) => [
      char,
      { key: char, code: `Key${char}`, keyCode: char.charCodeAt(0), shift: true },
    ])
  ),
  // Numbers
  ...Object.fromEntries(
    Array.from("0123456789").map((char) => [
      char,
      { key: char, code: `Digit${char}`, keyCode: char.charCodeAt(0) },
    ])
  ),
  // Special characters
  ".": { key: ".", code: "Period", keyCode: 190 },
  "/": { key: "/", code: "Slash", keyCode: 191 },
  ":": { key: ":", code: "Semicolon", keyCode: 186, shift: true },
  "-": { key: "-", code: "Minus", keyCode: 189 },
  "_": { key: "_", code: "Minus", keyCode: 189, shift: true },
  " ": { key: " ", code: "Space", keyCode: 32 },
  "Enter": { key: "Enter", code: "Enter", keyCode: 13 },
  "Escape": { key: "Escape", code: "Escape", keyCode: 27 },
};

export class KeySender {
  private sendCdpCommand: (method: string, params: Record<string, unknown>) => Promise<unknown>;

  constructor(sendCdpCommand: (method: string, params: Record<string, unknown>) => Promise<unknown>) {
    this.sendCdpCommand = sendCdpCommand;
  }

  /**
   * Types a string character-by-character into the active TradingView tab
   */
  async typeString(text: string, delayMs: number = 30): Promise<void> {
    logger.debug(`Typing string: "${text}"`);
    for (const char of text) {
      const def = KEY_MAP[char];
      if (!def) {
        logger.warn(`Character "${char}" not found in key map, attempting fallback.`);
        // Fallback for unmapped characters
        await this.sendRawKey(char, `Key${char.toUpperCase()}`, char.toUpperCase().charCodeAt(0), false);
        continue;
      }
      await this.sendKeyDefinition(def);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Sends a special key (like Enter, Escape, etc.)
   */
  async pressKey(keyName: "Enter" | "Escape"): Promise<void> {
    logger.debug(`Pressing key: ${keyName}`);
    const def = KEY_MAP[keyName];
    if (def) {
      await this.sendKeyDefinition(def);
    }
  }

  private async sendKeyDefinition(def: KeyDefinition): Promise<void> {
    const modifiers = def.shift ? 8 : 0; // 8 is Shift key modifier in CDP

    // 1. RawKeyDown
    await this.sendCdpCommand("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.keyCode,
      nativeVirtualKeyCode: def.keyCode,
      modifiers,
      text: def.shift || def.key.length === 1 ? def.key : "",
      unmodifiedText: def.shift || def.key.length === 1 ? def.key : "",
    });

    // 2. Char (only if it produces character input)
    if (def.key.length === 1) {
      await this.sendCdpCommand("Input.dispatchKeyEvent", {
        type: "char",
        key: def.key,
        code: def.code,
        windowsVirtualKeyCode: def.keyCode,
        nativeVirtualKeyCode: def.keyCode,
        modifiers,
        text: def.key,
        unmodifiedText: def.key,
      });
    }

    // 3. KeyUp
    await this.sendCdpCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.keyCode,
      nativeVirtualKeyCode: def.keyCode,
      modifiers,
    });
  }

  private async sendRawKey(key: string, code: string, keyCode: number, shift: boolean): Promise<void> {
    const modifiers = shift ? 8 : 0;
    await this.sendCdpCommand("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      modifiers,
    });
    await this.sendCdpCommand("Input.dispatchKeyEvent", {
      type: "char",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      modifiers,
      text: key,
    });
    await this.sendCdpCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      modifiers,
    });
  }
}
