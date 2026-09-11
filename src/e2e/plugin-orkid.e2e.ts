/**
 * plugin-orkid E2E TestSuite — verifies action, provider, and service
 * registrations and handler behavior for the Orkid swap engine plugin.
 */

import type {
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  TestSuite,
  UUID,
} from "@elizaos/core";

export const OrkidPluginTestSuite: TestSuite = {
  name: "plugin_orkid_test_suite",
  tests: [
    {
      name: "should_have_orkid_service",
      fn: async (runtime: IAgentRuntime) => {
        const service = runtime.getService("orkid");
        if (!service) {
          throw new Error("OrkidService not found in runtime");
        }
      },
    },

    {
      name: "should_have_get_quote_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_GET_QUOTE");
        if (!action) {
          throw new Error("ORKID_GET_QUOTE action not found");
        }
      },
    },

    {
      name: "should_have_execute_swap_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_EXECUTE_SWAP");
        if (!action) {
          throw new Error("ORKID_EXECUTE_SWAP action not found");
        }
      },
    },

    {
      name: "should_have_dry_run_swap_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_DRY_RUN_SWAP");
        if (!action) {
          throw new Error("ORKID_DRY_RUN_SWAP action not found");
        }
      },
    },

    {
      name: "should_have_list_tokens_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_LIST_TOKENS");
        if (!action) {
          throw new Error("ORKID_LIST_TOKENS action not found");
        }
      },
    },

    {
      name: "should_have_get_usage_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_GET_USAGE");
        if (!action) {
          throw new Error("ORKID_GET_USAGE action not found");
        }
      },
    },

    {
      name: "should_have_confirm_tx_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_CONFIRM_TX");
        if (!action) {
          throw new Error("ORKID_CONFIRM_TX action not found");
        }
      },
    },

    {
      name: "should_have_market_data_provider",
      fn: async (runtime: IAgentRuntime) => {
        const provider = runtime.providers.find(
          (p) => p.name === "ORKID_MARKET_DATA"
        );
        if (!provider) {
          throw new Error("ORKID_MARKET_DATA provider not found");
        }
      },
    },

    {
      name: "get_quote_action_rejects_missing_params",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_GET_QUOTE");
        if (!action) throw new Error("ORKID_GET_QUOTE not found");

        const testMessage: Memory = {
          entityId: "12345678-1234-1234-1234-123456789012" as UUID,
          roomId: "12345678-1234-1234-1234-123456789012" as UUID,
          content: { text: "quote please", source: "test" },
        };
        const testState: State = { values: {}, data: {}, text: "" };

        let responseText = "";
        const callback: HandlerCallback = async (response: Content) => {
          responseText = response.text || "";
          return [];
        };

        await action.handler(runtime, testMessage, testState, {}, callback);
        if (!responseText.includes("need")) {
          throw new Error(
            `Expected error about missing params, got: "${responseText}"`
          );
        }
      },
    },

    {
      name: "execute_swap_requires_confirmation",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_EXECUTE_SWAP");
        if (!action) throw new Error("ORKID_EXECUTE_SWAP not found");

        const testMessage: Memory = {
          entityId: "12345678-1234-1234-1234-123456789012" as UUID,
          roomId: "12345678-1234-1234-1234-123456789012" as UUID,
          content: { text: "execute 25 USDC to WETH on base", source: "test" },
        };
        const testState: State = { values: {}, data: {}, text: "" };

        let responseText = "";
        const callback: HandlerCallback = async (response: Content) => {
          responseText = response.text || "";
          return [];
        };

        // Pass options directly so the handler gets past param validation
        // and reaches the confirmation check
        await action.handler(runtime, testMessage, testState, {
          from: "USDC",
          to: "WETH",
          amount: "25",
          chain: "base",
          confirmed: false,
          user: "0x1234567890abcdef1234567890abcdef12345678",
        }, callback);
        if (!responseText.toLowerCase().includes("confirmation")) {
          throw new Error(
            `Expected confirmation requirement, got: "${responseText}"`
          );
        }
      },
    },

    {
      name: "execute_swap_rejects_missing_params",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_EXECUTE_SWAP");
        if (!action) throw new Error("ORKID_EXECUTE_SWAP not found");

        const testMessage: Memory = {
          entityId: "12345678-1234-1234-1234-123456789012" as UUID,
          roomId: "12345678-1234-1234-1234-123456789012" as UUID,
          content: { text: "execute swap", source: "test" },
        };
        const testState: State = { values: {}, data: {}, text: "" };

        let responseText = "";
        const callback: HandlerCallback = async (response: Content) => {
          responseText = response.text || "";
          return [];
        };

        await action.handler(runtime, testMessage, testState, {}, callback);
        if (!responseText.includes("need")) {
          throw new Error(
            `Expected error about missing params, got: "${responseText}"`
          );
        }
      },
    },

    {
      name: "dry_run_swap_rejects_missing_params",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_DRY_RUN_SWAP");
        if (!action) throw new Error("ORKID_DRY_RUN_SWAP not found");

        const testMessage: Memory = {
          entityId: "12345678-1234-1234-1234-123456789012" as UUID,
          roomId: "12345678-1234-1234-1234-123456789012" as UUID,
          content: { text: "dry run please", source: "test" },
        };
        const testState: State = { values: {}, data: {}, text: "" };

        let responseText = "";
        const callback: HandlerCallback = async (response: Content) => {
          responseText = response.text || "";
          return [];
        };

        await action.handler(runtime, testMessage, testState, {}, callback);
        if (!responseText.includes("need")) {
          throw new Error(
            `Expected error about missing params, got: "${responseText}"`
          );
        }
      },
    },

    {
      name: "confirm_tx_rejects_missing_tx_hash",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_CONFIRM_TX");
        if (!action) throw new Error("ORKID_CONFIRM_TX not found");

        const testMessage: Memory = {
          entityId: "12345678-1234-1234-1234-123456789012" as UUID,
          roomId: "12345678-1234-1234-1234-123456789012" as UUID,
          content: { text: "confirm my transaction", source: "test" },
        };
        const testState: State = { values: {}, data: {}, text: "" };

        let responseText = "";
        const callback: HandlerCallback = async (response: Content) => {
          responseText = response.text || "";
          return [];
        };

        await action.handler(runtime, testMessage, testState, {}, callback);
        if (!responseText.includes("transaction hash")) {
          throw new Error(
            `Expected error about missing tx hash, got: "${responseText}"`
          );
        }
      },
    },

    {
      name: "get_quote_rejects_unsupported_chain",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "ORKID_GET_QUOTE");
        if (!action) throw new Error("ORKID_GET_QUOTE not found");

        const testMessage: Memory = {
          entityId: "12345678-1234-1234-1234-123456789012" as UUID,
          roomId: "12345678-1234-1234-1234-123456789012" as UUID,
          content: { text: "quote on solana", source: "test" },
        };
        const testState: State = { values: {}, data: {}, text: "" };

        let responseText = "";
        const callback: HandlerCallback = async (response: Content) => {
          responseText = response.text || "";
          return [];
        };

        await action.handler(runtime, testMessage, testState, {
          from: "USDC",
          to: "WETH",
          amount: "25",
          chain: "solana",
        }, callback);
        if (!responseText.includes("Unsupported chain")) {
          throw new Error(
            `Expected unsupported chain error, got: "${responseText}"`
          );
        }
      },
    },

    {
      name: "all_actions_have_similes",
      fn: async (runtime: IAgentRuntime) => {
        for (const action of runtime.actions) {
          if (!action.similes || !Array.isArray(action.similes) || action.similes.length === 0) {
            throw new Error(`Action ${action.name} has no similes`);
          }
        }
      },
    },

    {
      name: "all_actions_have_descriptions",
      fn: async (runtime: IAgentRuntime) => {
        for (const action of runtime.actions) {
          if (!action.description || action.description.length < 20) {
            throw new Error(`Action ${action.name} has no description`);
          }
        }
      },
    },

    {
      name: "all_actions_have_examples",
      fn: async (runtime: IAgentRuntime) => {
        for (const action of runtime.actions) {
          if (!action.examples || !Array.isArray(action.examples)) {
            throw new Error(`Action ${action.name} has no examples`);
          }
        }
      },
    },

    {
      name: "market_data_provider_returns_context",
      fn: async (runtime: IAgentRuntime) => {
        const provider = runtime.providers.find(
          (p) => p.name === "ORKID_MARKET_DATA"
        );
        if (!provider) throw new Error("ORKID_MARKET_DATA provider not found");

        const testMessage: Memory = {
          entityId: "12345678-1234-1234-1234-123456789012" as UUID,
          roomId: "12345678-1234-1234-1234-123456789012" as UUID,
          content: { text: "what chains are supported?", source: "test" },
        };
        const testState: State = { values: {}, data: {}, text: "" };

        const result = await provider.get(runtime, testMessage, testState);
        if (!result.text || result.text.length === 0) {
          throw new Error("Provider returned empty text");
        }
        if (!result.text.includes("Orkid")) {
          throw new Error(`Provider text should mention Orkid, got: "${result.text}"`);
        }
      },
    },
  ],
};

export default OrkidPluginTestSuite;
