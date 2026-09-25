/**
 * ORKID_EXECUTE_SWAP — execute a gasless swap via /api/v1/solve.
 *
 * This is a LIVE EXECUTION action — it submits a real transaction and
 * counts as billable volume for rebate calculations.
 *
 * Two gates, both structural (never inferred from message text):
 *   1. `options.confirmed === true` — set by the caller after the user
 *      has confirmed a specific quote.
 *   2. `options.permit` + `options.signature` — a signed Permit2 permit.
 * Free-text confirmation words are intentionally NOT honored: trigger
 * words and hedges in user messages are not confirmation.
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

interface ExecuteOptions {
  from?: string;
  to?: string;
  amount?: string;
  chain?: string;
  user?: string;
  slippageBps?: number;
  /** Permit2 permit object (signed) */
  permit?: {
    permitted: { token: string; amount: string };
    nonce: string;
    deadline: string;
  };
  /** 65-byte hex signature */
  signature?: string;
  /** Set to true when the user has explicitly confirmed */
  confirmed?: boolean;
}

function parseExecuteOptions(text: string): ExecuteOptions {
  const opts: ExecuteOptions = {};
  const directMatch = text.match(/(?:^|[^\w.])([\d.]+)\s+(\S+)\s+to\s+(\S+)\s+on\s+([a-z0-9-]+)(?:\s+for\s+(0x[a-fA-F0-9]+))?/i);
  if (directMatch) {
    opts.amount = directMatch[1];
    opts.from = directMatch[2];
    opts.to = directMatch[3];
    opts.chain = directMatch[4].toLowerCase();
    if (directMatch[5]) opts.user = directMatch[5];
    return opts;
  }
  const fromMatch = text.match(/(?:from|sell|send)\s+(\S+)/i);
  const toMatch = text.match(/(?:to|buy|get|receive)\s+(\S+)/i);
  const amountMatch = text.match(/(?:amount|amt|for)\s+([\d.]+)/i);
  const chainMatch = text.match(/(?:on|chain)\s+(\S+)/i);
  if (fromMatch) opts.from = fromMatch[1];
  if (toMatch) opts.to = toMatch[1];
  if (amountMatch) opts.amount = amountMatch[1];
  if (chainMatch) opts.chain = chainMatch[1].toLowerCase();
  return opts;
}

export const executeSwapAction: Action = {
  name: "ORKID_EXECUTE_SWAP",
  similes: [
    "EXECUTE_SWAP",
    "ORKID_SWAP",
    "SWAP_NOW",
    "DO_SWAP",
    "LIVE_SWAP",
  ],
  description:
    "Execute a live gasless swap through Orkid. Requires user confirmation — options.confirmed === true (set after the user confirms a quote) plus a signed Permit2 permit and signature. This is a billable execution.",

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

      const opts = (options as ExecuteOptions) || {};
      const parsed = parseExecuteOptions(message.content.text || "");
      const from = opts.from || parsed.from;
      const to = opts.to || parsed.to;
      const amount = opts.amount || parsed.amount;
      const chain = (opts.chain || parsed.chain || "base").toLowerCase();
      const userRaw = opts.user || runtime.getSetting("ORKID_USER_ADDRESS");
      const user = userRaw ? String(userRaw) : "";
      // Structured confirmation only — free text is never a confirm signal.
      const confirmed = opts.confirmed === true;

      if (!from || !to || !amount) {
        const text =
          "I need the token to sell, the token to buy, and the amount to execute a swap.";
        if (callback) await callback({ text, actions: ["ORKID_EXECUTE_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      if (!ORKID_CHAINS.includes(chain as (typeof ORKID_CHAINS)[number])) {
        const text = `Unsupported chain: ${chain}. Supported: ${ORKID_CHAINS.join(", ")}`;
        if (callback) await callback({ text, actions: ["ORKID_EXECUTE_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      if (!user) {
        const text =
          "Execution requires a user wallet address. Set ORKID_USER_ADDRESS or provide it.";
        if (callback) await callback({ text, actions: ["ORKID_EXECUTE_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      if (!confirmed) {
        const text = [
          `I will NOT execute this swap without explicit confirmation.`,
          ``,
          `To proceed, get a quote first (ORKID_GET_QUOTE), present it to the`,
          `user, then re-invoke this action with options { confirmed: true }.`,
        ].join("\n");
        if (callback) await callback({ text, actions: ["ORKID_EXECUTE_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      if (!opts.permit || !opts.signature) {
        const text = [
          `Execution requires a signed Permit2 permit and signature.`,
          `The permit must be generated and signed by the user's wallet.`,
          `Use OrkidViemPermitSigner (@orkid-labs/sdk/viem) or OrkidEthersPermitSigner (@orkid-labs/sdk/ethers) to sign.`,
        ].join("\n");
        if (callback) await callback({ text, actions: ["ORKID_EXECUTE_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      logger.info(`Orkid execute: ${amount} ${from} → ${to} on ${chain} for ${user}`);
      const result = await client.solve({
        from,
        to,
        amount,
        chain,
        user,
        permit: opts.permit,
        signature: opts.signature,
        slippageBps: opts.slippageBps ?? 50,
      });

      if (!result.ok) {
        const text = `Swap execution failed: ${result.error || "unknown error"}`;
        if (callback) await callback({ text, actions: ["ORKID_EXECUTE_SWAP"] });
        return { success: false, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      const q = result.quote;
      const tx = result.transaction;
      const lines = [
        `**Swap Executed**`,
        q ? `${q.amountIn} ${from} → ${q.amountOut} ${to}` : "",
        q ? `Rate: ${q.rate}` : "",
        q ? `Protocol: ${q.protocol}` : "",
      ];
      if (tx?.txHash) {
        lines.push(`Transaction: ${tx.txHash}`);
      }
      if (result.gaslessEligible === false && tx) {
        lines.push(
          `Gasless not eligible — submit this calldata yourself (user pays gas):`
        );
        lines.push(`  To: ${tx.to}`);
        lines.push(`  Value: ${tx.value}`);
        lines.push(`  Data: ${tx.data.slice(0, 66)}...`);
        lines.push(`Use ORKID_CONFIRM_TX after submitting to make it rebate-eligible.`);
      }
      lines.push("", "This swap counts as billable volume.");

      const text = lines.filter(Boolean).join("\n");
      if (callback)
        await callback({ text, actions: ["ORKID_EXECUTE_SWAP"], data: result as any });
      return { success: true, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    } catch (error) {
      const text = `Execution error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["ORKID_EXECUTE_SWAP"] });
      return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: {
          text: "yes — execute the quoted swap",
          actions: [],
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Swap executed: 25 USDC → 0.0102 WETH. Tx: 0xabc... This counts as billable volume.",
          actions: ["ORKID_EXECUTE_SWAP"],
        },
      },
    ],
  ],
};
