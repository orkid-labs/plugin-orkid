/**
 * ORKID_LIST_TOKENS — list tokens for a chain from Orkid's token search.
 */

import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { logger } from "@elizaos/core";
import { ORKID_CHAINS } from "@orkid-labs/sdk";
import { OrkidService } from "../service";

interface ListTokensOptions {
  chain?: string;
  search?: string;
  limit?: number;
}

export const listTokensAction: Action = {
  name: "ORKID_LIST_TOKENS",
  similes: [
    "LIST_TOKENS",
    "ORKID_TOKENS",
    "TOKENS_ON",
    "SEARCH_TOKENS",
    "FIND_TOKEN",
  ],
  description: "List or search tokens available on Orkid for a given chain.",

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    const service = runtime.getService<OrkidService>(OrkidService.serviceType);
    return !!service;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: HandlerOptions | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<OrkidService>(OrkidService.serviceType);
      if (!service) {
        return { success: false, text: "Orkid service not available" };
      }
      const client = service.getClient();

      const opts = (options as ListTokensOptions) || {};
      const chainMatch = (message.content.text || "").match(/(?:on|chain)\s+(\S+)/i);
      const searchMatch = (message.content.text || "").match(/(?:search|find)\s+(\S+)/i);
      const chain = (opts.chain || chainMatch?.[1] || "base").toLowerCase();
      const search = opts.search || searchMatch?.[1];
      const limit = opts.limit ?? 10;

      if (!ORKID_CHAINS.includes(chain as (typeof ORKID_CHAINS)[number])) {
        const text = `Unsupported chain: ${chain}. Supported: ${ORKID_CHAINS.join(", ")}`;
        if (callback) await callback({ text, actions: ["ORKID_LIST_TOKENS"] });
        return { success: false, text };
      }

      logger.info(`Orkid listTokens: chain=${chain} search=${search ?? ""}`);
      const result = await client.listTokens({ chain, search, limit });

      if (!result.ok || !result.tokens) {
        const text = `Token list failed: ${result.error || "unknown error"}`;
        if (callback) await callback({ text, actions: ["ORKID_LIST_TOKENS"] });
        return { success: false, text };
      }

      const tokens = result.tokens.slice(0, limit);
      const lines = [
        `**Tokens on ${chain}** (${tokens.length} shown)`,
        ...tokens.map(
          (t) => `${t.symbol} — ${t.address} (${t.decimals} decimals)`
        ),
      ];
      const text = lines.join("\n");

      if (callback)
        await callback({ text, actions: ["ORKID_LIST_TOKENS"], data: result as any });
      return { success: true, text, data: result as any };
    } catch (error) {
      const text = `List tokens error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["ORKID_LIST_TOKENS"] });
      return { success: false, text };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: { text: "list tokens on base", actions: [] },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Tokens on base: USDC, WETH, DAI, USDT, cbETH...",
          actions: ["ORKID_LIST_TOKENS"],
        },
      },
    ],
  ],
};
