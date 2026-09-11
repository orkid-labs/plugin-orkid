/**
 * ORKID_GET_QUOTE — get an executable quote for a swap via /api/v1/route.
 *
 * This is a QUOTE ONLY action — it does NOT execute a trade and does NOT
 * count as billable volume. Use ORKID_EXECUTE_SWAP for live execution.
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

interface QuoteOptions {
  from?: string;
  to?: string;
  amount?: string;
  chain?: string;
}

function parseQuoteOptions(text: string): QuoteOptions {
  const opts: QuoteOptions = {};
  // Strip leading slash/bang command prefix (e.g. /quote, !quote, /dryrun)
  const clean = text.replace(/^[\/!][a-zA-Z-]*\s*/, '').trim();
  // Handle '25 USDC to WETH on base' (after command word stripped)
  const directMatch = clean.match(/^([\d.]+)\s+(\S+)\s+to\s+(\S+)\s+on\s+(\S+)/i);
  if (directMatch) {
    opts.amount = directMatch[1];
    opts.from = directMatch[2];
    opts.to = directMatch[3];
    opts.chain = directMatch[4].toLowerCase();
    return opts;
  }
  const fromMatch = clean.match(/(?:from|sell|send)\s+(\S+)/i);
  const toMatch = clean.match(/(?:to|buy|get|receive)\s+(\S+)/i);
  const amountMatch = clean.match(/(?:amount|amt|for)\s+([\d.]+)/i);
  const chainMatch = clean.match(/(?:on|chain)\s+(\S+)/i);
  if (fromMatch) opts.from = fromMatch[1];
  if (toMatch) opts.to = toMatch[1];
  if (amountMatch) opts.amount = amountMatch[1];
  if (chainMatch) opts.chain = chainMatch[1].toLowerCase();
  return opts;
}

export const getQuoteAction: Action = {
  name: "ORKID_GET_QUOTE",
  similes: [
    "GET_QUOTE",
    "ORKID_QUOTE",
    "QUOTE_SWAP",
    "PRICE_SWAP",
    "CHECK_RATE",
  ],
  description:
    "Get an executable swap quote from Orkid. This is a quote only — no trade is executed.",

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

      const opts = (options as QuoteOptions) || {};
      const parsed = parseQuoteOptions(message.content.text || "");
      const from = opts.from || parsed.from;
      const to = opts.to || parsed.to;
      const amount = opts.amount || parsed.amount;
      const chain = (opts.chain || parsed.chain || "base").toLowerCase();

      if (!from || !to || !amount) {
        const text =
          "I need the token to sell, the token to buy, and the amount. Example: 'quote 25 USDC to WETH on base'";
        if (callback) await callback({ text, actions: ["ORKID_GET_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      if (!ORKID_CHAINS.includes(chain as (typeof ORKID_CHAINS)[number])) {
        const text = `Unsupported chain: ${chain}. Supported chains: ${ORKID_CHAINS.join(", ")}`;
        if (callback) await callback({ text, actions: ["ORKID_GET_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      logger.info(`Orkid quote: ${amount} ${from} → ${to} on ${chain}`);
      const result = await client.getQuote({ from, to, amount, chain });

      if (!result.ok || !result.quote) {
        const text = `Quote failed: ${result.error || "unknown error"}`;
        if (callback) await callback({ text, actions: ["ORKID_GET_QUOTE"] });
        return { success: false, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      const q = result.quote;
      const text = [
        `**Quote (non-executed)**`,
        `${amount} ${from} → ${q.amountOut} ${to}`,
        `Rate: ${q.rate}`,
        `Protocol: ${q.protocol}`,
        `Price impact: ${q.priceImpactBps != null ? (q.priceImpactBps < 0.01 ? "<0.01" : q.priceImpactBps.toFixed(2)) : "n/a"} bps`,
        `Volume: $${q.volumeUsd.toFixed(2)}`,
        `Gasless eligible: ${result.gaslessEligible ? "yes" : "no (user pays gas)"}`,
        ``,
        `This is a quote only. No trade was executed.`,
      ].join("\n");

      if (callback)
        await callback({ text, actions: ["ORKID_GET_QUOTE"], data: result as any });
        return { success: true, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    } catch (error) {
      const text = `Quote error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["ORKID_GET_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: { text: "quote 25 USDC to WETH on base", actions: [] },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Quote received: 25 USDC → 0.0102 WETH on Aerodrome. This is a quote only.",
          actions: ["ORKID_GET_QUOTE"],
        },
      },
    ],
  ],
};
