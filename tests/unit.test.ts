import { describe, it, expect, vi } from "vitest";
import { KeySender, KeyDefinition } from "../src/utils/key-sender.js";

describe("KeySender", () => {
  it("should correctly translate letters, numbers, and dispatch CDP events", async () => {
    const sentEvents: Array<{ method: string; params: any }> = [];
    const mockSend = async (method: string, params: Record<string, unknown>) => {
      sentEvents.push({ method, params });
      return {};
    };

    const sender = new KeySender(mockSend);

    // Type a simple ticker symbol
    await sender.typeString("A1.");

    // "A1." contains:
    // 'A': shift: true, keyCode: 65, key: 'A', code: 'KeyA'
    // '1': keyCode: 49, key: '1', code: 'Digit1'
    // '.': keyCode: 190, key: '.', code: 'Period'

    // Let's verify events dispatched
    expect(sentEvents.length).toBe(9); // 'A' (rawKeyDown, char, keyUp) + '1' (rawKeyDown, char, keyUp) + '.' (rawKeyDown, char, keyUp)
    // Wait, let's inspect the exact layout of KEY_MAP and character lengths.
    // 'A', '1', '.' all have length 1. So they send: rawKeyDown, char, keyUp (3 events each).
    // Let's check: 'A' has shift: true -> modifiers = 8.
    
    // Check first event (rawKeyDown for 'A')
    expect(sentEvents[0]).toEqual({
      method: "Input.dispatchKeyEvent",
      params: {
        type: "rawKeyDown",
        key: "A",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
        modifiers: 8,
        text: "A",
        unmodifiedText: "A",
      },
    });

    // Check third event (keyUp for 'A')
    expect(sentEvents[2]).toEqual({
      method: "Input.dispatchKeyEvent",
      params: {
        type: "keyUp",
        key: "A",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
        modifiers: 8,
      },
    });
  });

  it("should dispatch special keys correctly", async () => {
    const sentEvents: Array<{ method: string; params: any }> = [];
    const mockSend = async (method: string, params: Record<string, unknown>) => {
      sentEvents.push({ method, params });
      return {};
    };

    const sender = new KeySender(mockSend);
    await sender.pressKey("Enter");

    // "Enter" has length > 1, so it shouldn't dispatch "char" event
    expect(sentEvents.length).toBe(2); // rawKeyDown, keyUp
    expect(sentEvents[0].params.type).toBe("rawKeyDown");
    expect(sentEvents[0].params.key).toBe("Enter");
    expect(sentEvents[1].params.type).toBe("keyUp");
  });
});
