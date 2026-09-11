/**
 * Component tests for plugin-orkid — verifies plugin structure, action
 * validation, service behavior, and handler edge cases with a mocked runtime.
 */

import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { orkidPlugin } from "../index";
import { OrkidService } from "../service";

async function createMockRuntime(configured: boolean = true): Promise<IAgentRuntime> {
  const services = new Map<string, unknown>();
  const runtime = {
    character: { name: "Eliza" } as any,
    actions: orkidPlugin.actions ?? [],
    providers: orkidPlugin.providers ?? [],
    getSetting: (key: string) => {
      if (key === "ORKID_API_KEY") return configured ? "0123456789abcdef0123456789abcdef01234567" : null;
      if (key === "ORKID_USER_ADDRESS")
        return configured ? "0x1234567890abcdef1234567890abcdef12345678" : null;
      return null;
    },
    getService: <T>(name: string) => services.get(name) as T | undefined,
    _services: services,
  } as unknown as IAgentRuntime;
  services.set("orkid", await OrkidService.start(runtime));
  return runtime;
}

function makeCallback(): { callback: any; calls: any[] } {
  const calls: any[] = [];
  const callback = vi.fn(async (response: any) => {
    calls.push(response);
    return [];
  });
  return { callback, calls };
}

describe("plugin-orkid structure", () => {
  it("should have correct name", () => {
    expect(orkidPlugin.name).toBe("plugin-orkid");
  });

  it("should have 6 actions", () => {
    expect(orkidPlugin.actions).toHaveLength(6);
  });

  it("should have 1 provider", () => {
    expect(orkidPlugin.providers).toHaveLength(1);
  });

  it("should have OrkidService", () => {
    expect(orkidPlugin.services).toContain(OrkidService);
  });

  it("should have all expected action names", () => {
    const names = orkidPlugin.actions?.map((a) => a.name) ?? [];
    expect(names).toContain("ORKID_GET_QUOTE");
    expect(names).toContain("ORKID_EXECUTE_SWAP");
    expect(names).toContain("ORKID_DRY_RUN_SWAP");
    expect(names).toContain("ORKID_LIST_TOKENS");
    expect(names).toContain("ORKID_GET_USAGE");
    expect(names).toContain("ORKID_CONFIRM_TX");
  });

  it("should have market data provider", () => {
    const providerName = orkidPlugin.providers?.[0]?.name;
    expect(providerName).toBe("ORKID_MARKET_DATA");
  });
});

describe("OrkidService", () => {
  it("should have correct serviceType", () => {
    expect(OrkidService.serviceType).toBe("orkid");
  });

  it("should have capabilityDescription", () => {
    const service = new OrkidService({} as IAgentRuntime);
    expect(service.capabilityDescription).toContain("Orkid");
  });

  it("should initialize client with API key", async () => {
    const runtime = await createMockRuntime(true);
    const service = runtime.getService<OrkidService>("orkid")!;
    expect(service).toBeDefined();
    // getClient should not throw
    expect(() => service.getClient()).not.toThrow();
  });

  it("should initialize without API key (anonymous)", async () => {
    const runtime = await createMockRuntime(false);
    const service = runtime.getService<OrkidService>("orkid")!;
    expect(service).toBeDefined();
    expect(() => service.getClient()).not.toThrow();
  });

  it("should stop cleanly", async () => {
    const runtime = await createMockRuntime(true);
    const service = runtime.getService<OrkidService>("orkid")!;
    await service.stop();
    // After stop, getClient should throw
    expect(() => service.getClient()).toThrow("not initialized");
  });
});

describe("action validation — all 6 actions", () => {
  it("getQuote should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_GET_QUOTE");
    const valid = await action!.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("executeSwap should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_EXECUTE_SWAP");
    const valid = await action!.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("dryRunSwap should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_DRY_RUN_SWAP");
    const valid = await action!.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("listTokens should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_LIST_TOKENS");
    const valid = await action!.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("getUsage should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_GET_USAGE");
    const valid = await action!.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("confirmTx should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_CONFIRM_TX");
    const valid = await action!.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("all actions should fail validation when service not registered", async () => {
    const runtime = {
      getSetting: () => null,
      getService: () => undefined,
      getTasks: () => [],
    } as unknown as IAgentRuntime;

    for (const action of orkidPlugin.actions ?? []) {
      const valid = await action.validate(runtime, {} as any, undefined);
      expect(valid).toBe(false);
    }
  });
});

describe("action metadata", () => {
  it("all actions should have similes", () => {
    for (const action of orkidPlugin.actions ?? []) {
      expect(action.similes).toBeDefined();
      expect(Array.isArray(action.similes)).toBe(true);
      expect((action.similes as string[]).length).toBeGreaterThan(0);
    }
  });

  it("all actions should have examples defined", () => {
    for (const action of orkidPlugin.actions ?? []) {
      expect(action.examples).toBeDefined();
      expect(Array.isArray(action.examples)).toBe(true);
    }
  });

  it("all actions should have descriptions", () => {
    for (const action of orkidPlugin.actions ?? []) {
      expect(action.description).toBeDefined();
      expect(action.description.length).toBeGreaterThan(20);
    }
  });

  it("getQuote description should mention quote only", () => {
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_GET_QUOTE");
    expect(action!.description).toContain("quote");
  });

  it("executeSwap description should mention confirmation", () => {
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_EXECUTE_SWAP");
    expect(action!.description).toContain("confirmation");
  });

  it("executeSwap description should mention billable", () => {
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_EXECUTE_SWAP");
    expect(action!.description).toContain("billable");
  });
});

describe("handler edge cases", () => {
  it("getQuote should reject missing params", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_GET_QUOTE");
    const { callback, calls } = makeCallback();

    const result: any = await action!.handler(
      runtime,
      { content: { text: "quote please" } } as any,
      undefined,
      {} as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("need");
    expect(calls.length).toBe(1);
  });

  it("getQuote should reject unsupported chain", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_GET_QUOTE");
    const { callback, calls } = makeCallback();

    const result: any = await action!.handler(
      runtime,
      { content: { text: "quote on solana" } } as any,
      undefined,
      { from: "USDC", to: "WETH", amount: "25", chain: "solana" } as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("Unsupported chain");
  });

  it("executeSwap should require confirmation", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_EXECUTE_SWAP");
    const { callback, calls } = makeCallback();

    const result: any = await action!.handler(
      runtime,
      { content: { text: "execute 25 USDC to WETH on base" } } as any,
      undefined,
      { from: "USDC", to: "WETH", amount: "25", chain: "base", confirmed: false } as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text.toLowerCase()).toContain("confirmation");
  });

  it("executeSwap should reject missing params", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_EXECUTE_SWAP");
    const { callback } = makeCallback();

    const result: any = await action!.handler(
      runtime,
      { content: { text: "execute swap" } } as any,
      undefined,
      {} as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("need");
  });

  it("dryRunSwap should reject missing params", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_DRY_RUN_SWAP");
    const { callback } = makeCallback();

    const result: any = await action!.handler(
      runtime,
      { content: { text: "dry run" } } as any,
      undefined,
      {} as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("need");
  });

  it("confirmTx should reject missing tx hash", async () => {
    const runtime = await createMockRuntime(true);
    const action = orkidPlugin.actions?.find((a) => a.name === "ORKID_CONFIRM_TX");
    const { callback } = makeCallback();

    const result: any = await action!.handler(
      runtime,
      { content: { text: "confirm my tx" } } as any,
      undefined,
      {} as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("transaction hash");
  });

  it("all actions should handle missing service gracefully", async () => {
    const runtime = {
      getSetting: () => null,
      getService: () => undefined,
      getTasks: () => [],
    } as unknown as IAgentRuntime;

    for (const action of orkidPlugin.actions ?? []) {
      const { callback } = makeCallback();
      const result: any = await action.handler(
        runtime,
        { content: { text: "test" } } as any,
        undefined,
        {} as any,
        callback
      );
      expect(result.success).toBe(false);
      expect(result.text).toContain("not available");
    }
  });
});

describe("plugin lifecycle", () => {
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
