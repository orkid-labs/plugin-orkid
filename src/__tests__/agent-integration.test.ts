/**
 * Live agent integration tests — boots a real ElizaOS AgentRuntime with
 * plugin-orkid loaded, then exercises action handlers and provider.
 * No live API calls are made (no API key set); tests focus on handler
 * logic, param validation, confirmation gates, and provider context.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestRuntime, cleanupTestRuntime } from "./test-utils";
import { orkidPlugin } from "../index";
import { OrkidService } from "../service";
import type { IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { vi } from "vitest";

let runtime: IAgentRuntime;

beforeAll(async () => {
  // Set a test API key so the service initializes
  process.env.ORKID_API_KEY = "0123456789abcdef0123456789abcdef01234567";
  process.env.ORKID_USER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
  runtime = await createTestRuntime({
    character: { name: "Orkid Test Agent" },
    plugins: [orkidPlugin],
  });
}, 30000);

afterAll(async () => {
  await cleanupTestRuntime(runtime);
  delete process.env.ORKID_API_KEY;
  delete process.env.ORKID_USER_ADDRESS;
});

function makeCallback(): { callback: HandlerCallback; calls: any[] } {
  const calls: any[] = [];
  const callback = vi.fn(async (response: any) => {
    calls.push(response);
    return [];
  }) as any as HandlerCallback;
  return { callback, calls };
}

function makeMessage(text: string): Memory {
  return {
    entityId: "12345678-1234-1234-1234-123456789012" as any,
    roomId: "12345678-1234-1234-1234-123456789012" as any,
    content: { text, source: "test" },
  } as Memory;
}

function makeState(): State {
  return { values: {}, data: {}, text: "" };
}

describe("agent integration — plugin-orkid", () => {
  it("should have OrkidService available", () => {
    const svc = runtime.getService("orkid");
    expect(svc).toBeDefined();
  });

  it("should have all 6 actions registered", () => {
    const names = runtime.actions.map((a) => a.name);
    expect(names).toContain("ORKID_GET_QUOTE");
    expect(names).toContain("ORKID_EXECUTE_SWAP");
    expect(names).toContain("ORKID_DRY_RUN_SWAP");
    expect(names).toContain("ORKID_LIST_TOKENS");
    expect(names).toContain("ORKID_GET_USAGE");
    expect(names).toContain("ORKID_CONFIRM_TX");
  });

  it("should have ORKID_MARKET_DATA provider", () => {
    const provider = runtime.providers.find((p) => p.name === "ORKID_MARKET_DATA");
    expect(provider).toBeDefined();
  });
});

describe("agent integration — handler validation", () => {
  it("getQuote rejects missing from/to/amount", async () => {
    const action = runtime.actions.find((a) => a.name === "ORKID_GET_QUOTE")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime, makeMessage("quote please"), makeState(),
      {} as any, callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("need");
    expect(calls.length).toBe(1);
  });

  it("getQuote rejects unsupported chain", async () => {
    const action = runtime.actions.find((a) => a.name === "ORKID_GET_QUOTE")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime, makeMessage("quote on solana"), makeState(),
      { from: "USDC", to: "WETH", amount: "25", chain: "solana" } as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("Unsupported chain");
    expect(calls[0].actions).toContain("ORKID_GET_QUOTE");
  });

  it("executeSwap requires confirmation", async () => {
    const action = runtime.actions.find((a) => a.name === "ORKID_EXECUTE_SWAP")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime, makeMessage("execute 25 USDC to WETH on base"), makeState(),
      { from: "USDC", to: "WETH", amount: "25", chain: "base", confirmed: false, user: "0x1234567890abcdef1234567890abcdef12345678" } as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text.toLowerCase()).toContain("confirmation");
    expect(calls[0].actions).toContain("ORKID_EXECUTE_SWAP");
  });

  it("executeSwap rejects missing params", async () => {
    const action = runtime.actions.find((a) => a.name === "ORKID_EXECUTE_SWAP")!;
    const { callback } = makeCallback();

    const result: any = await action.handler(
      runtime, makeMessage("execute swap"), makeState(),
      {} as any, callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("need");
  });

  it("dryRunSwap rejects missing params", async () => {
    const action = runtime.actions.find((a) => a.name === "ORKID_DRY_RUN_SWAP")!;
    const { callback } = makeCallback();

    const result: any = await action.handler(
      runtime, makeMessage("dry run"), makeState(),
      {} as any, callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("need");
  });

  it("confirmTx rejects missing tx hash", async () => {
    const action = runtime.actions.find((a) => a.name === "ORKID_CONFIRM_TX")!;
    const { callback } = makeCallback();

    const result: any = await action.handler(
      runtime, makeMessage("confirm my tx"), makeState(),
      {} as any, callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("transaction hash");
  });
});

describe("agent integration — provider", () => {
  it("ORKID_MARKET_DATA provider returns context", async () => {
    const provider = runtime.providers.find((p) => p.name === "ORKID_MARKET_DATA")!;
    const result: any = await provider.get(runtime, makeMessage("what chains?"), makeState());

    expect(result.text).toBeDefined();
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).toContain("Orkid");
    expect(result.values).toBeDefined();
    expect((result.values as any).orkidChains).toBeDefined();
    expect(Array.isArray((result.values as any).orkidChains)).toBe(true);
  });

  it("provider returns chain configs in data", async () => {
    const provider = runtime.providers.find((p) => p.name === "ORKID_MARKET_DATA")!;
    const result: any = await provider.get(runtime, makeMessage("chains"), makeState());

    expect(result.data).toBeDefined();
    const data = result.data as any;
    expect(data.chains).toBeDefined();
    expect(data.chainConfigs).toBeDefined();
    expect(Array.isArray(data.chainConfigs)).toBe(true);
    // Each config should have name, id, minNotionalUsd
    if (data.chainConfigs.length > 0) {
      expect(data.chainConfigs[0]).toHaveProperty("name");
      expect(data.chainConfigs[0]).toHaveProperty("id");
      expect(data.chainConfigs[0]).toHaveProperty("minNotionalUsd");
    }
  });
});

describe("agent integration — action metadata", () => {
  it("all actions have similes", () => {
    for (const action of runtime.actions) {
      expect(action.similes).toBeDefined();
      expect(Array.isArray(action.similes)).toBe(true);
      expect((action.similes as string[]).length).toBeGreaterThan(0);
    }
  });

  it("all actions have descriptions", () => {
    for (const action of runtime.actions) {
      expect(action.description).toBeDefined();
      expect(action.description.length).toBeGreaterThan(20);
    }
  });

  it("all actions have examples defined", () => {
    for (const action of runtime.actions) {
      expect(action.examples).toBeDefined();
      expect(Array.isArray(action.examples)).toBe(true);
    }
  });

  it("getQuote has quote-related similes", () => {
    const action = runtime.actions.find((a) => a.name === "ORKID_GET_QUOTE")!;
    expect(action.similes).toContain("GET_QUOTE");
    expect(action.similes).toContain("QUOTE_SWAP");
  });

  it("executeSwap has execution-related similes", () => {
    const action = runtime.actions.find((a) => a.name === "ORKID_EXECUTE_SWAP")!;
    expect(action.similes).toContain("EXECUTE_SWAP");
    expect(action.similes).toContain("LIVE_SWAP");
  });
});

describe("agent integration — error handling", () => {
  it("all actions handle missing service gracefully", async () => {
    const bareRuntime = {
      getSetting: () => null,
      getService: () => undefined,
    } as unknown as IAgentRuntime;

    for (const action of runtime.actions.filter((a) => a.name.startsWith("ORKID_"))) {
      const { callback } = makeCallback();
      const result: any = await action.handler(
        bareRuntime,
        makeMessage("test"),
        makeState(),
        {} as any,
        callback
      );
      expect(result.success).toBe(false);
      expect(result.text).toContain("not available");
    }
  });

  it("OrkidService.getClient throws after stop", async () => {
    const svc = new OrkidService({ getSetting: () => "test-key" } as any);
    // Service was initialized in constructor via start(), but we create a new one
    // and stop it to test the throw
    await svc.stop();
    expect(() => svc.getClient()).toThrow("not initialized");
  });
});

describe("agent integration — plugin lifecycle", () => {
  it("should init with valid config", async () => {
    await (orkidPlugin.init as any)({
      ORKID_API_KEY: "0123456789abcdef0123456789abcdef01234567",
      ORKID_API_URL: "https://orkidlabs.xyz",
    });
    expect(process.env.ORKID_API_KEY).toBe("0123456789abcdef0123456789abcdef01234567");
  });

  it("should reject invalid config", async () => {
    await expect(
      (orkidPlugin.init as any)({ ORKID_API_KEY: 123 as any })
    ).rejects.toThrow();
  });
});
