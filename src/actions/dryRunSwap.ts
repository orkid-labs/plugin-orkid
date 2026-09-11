/**
 * ORKID_DRY_RUN_SWAP — dry-run a swap via /api/v1/solve with dryRun:true.
 *
 * Returns what would happen without executing. Non-billable.
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

interface DryRunOptions {
  from?: string;
  to?: string;
  amount?: string;
  chain?: string;
  user?: string;
  slippageBps?: number;
}

function parseDryRunOptions(text: string): DryRunOptions {
  const opts: DryRunOptions = {};
  // Strip leading slash/bang command prefix (e.g. /dryrun, !dryrun)
  const clean = text.replace(/^[\/!][a-zA-Z-]*\s*/, '').trim();
  // Handle '25 USDC to WETH on base' (after command word stripped)
  const directMatch = clean.match(/^([\d.]+)\s+(\S+)\s+to\s+(\S+)\s+on\s+(\S+?)(?:\s+for\s+(0x[a-fA-F0-9]+))?$/i);
  if (directMatch) {
    opts.amount = directMatch[1];
    opts.from = directMatch[2];
    opts.to = directMatch[3];
    opts.chain = directMatch[4].toLowerCase();
    if (directMatch[5]) opts.user = directMatch[5];
    return opts;
  }
  const fromMatch = clean.match(/(?:from|sell|send)\s+(\S+)/i);
  const toMatch = clean.match(/(?:to|buy|get|receive)\s+(\S+)/i);
  const amountMatch = clean.match(/(?:amount|amt)\s+([\d.]+)/i);
  const chainMatch = clean.match(/(?:on|chain)\s+(\S+)/i);
  const userMatch = clean.match(/(?:for|user|address)\s+(0x[a-fA-F0-9]+)/i);
  if (fromMatch) opts.from = fromMatch[1];
  if (toMatch) opts.to = toMatch[1];
  if (amountMatch) opts.amount = amountMatch[1];
  if (chainMatch) opts.chain = chainMatch[1].toLowerCase();
  if (userMatch) opts.user = userMatch[1];
  return opts;
}

export const dryRunSwapAction: Action = {
  name: "ORKID_DRY_RUN_SWAP",
  similes: [
    "DRY_RUN_SWAP",
    "SIMULATE_SWAP",
    "ORKID_SIMULATE",
    "TEST_SWAP",
  ],
  description:
    "Dry-run a swap through Orkid — simulates execution without submitting a transaction. Non-billable.",

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

      const opts = (options as DryRunOptions) || {};
      const parsed = parseDryRunOptions(message.content.text || "");
      const from = opts.from || parsed.from;
      const to = opts.to || parsed.to;
      const amount = opts.amount || parsed.amount;
      const chain = (opts.chain || parsed.chain || "base").toLowerCase();
      const userRaw = opts.user || parsed.user || runtime.getSetting("ORKID_USER_ADDRESS");
      const user = userRaw ? String(userRaw) : "";

      if (!from || !to || !amount) {
        const text =
          "I need the token to sell, the token to buy, and the amount for a dry run.";
        if (callback) await callback({ text, actions: ["ORKID_DRY_RUN_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      if (!ORKID_CHAINS.includes(chain as (typeof ORKID_CHAINS)[number])) {
        const text = `Unsupported chain: ${chain}. Supported: ${ORKID_CHAINS.join(", ")}`;
        if (callback) await callback({ text, actions: ["ORKID_DRY_RUN_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      if (!user) {
        const text =
          "Dry run requires a user wallet address. Set ORKID_USER_ADDRESS or provide it in the request.";
        if (callback) await callback({ text, actions: ["ORKID_DRY_RUN_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      logger.info(`Orkid dry-run: ${amount} ${from} → ${to} on ${chain} for ${user}`);

      // Resolve the input token address + decimals via listTokens so the permit matches.
      const tokens = await client.listTokens({ chain, search: from, limit: 5 });
      const token = tokens.tokens?.find(
        (t) => t.symbol.toLowerCase() === from.toLowerCase()
      );
      if (!token) {
        const text = `Dry run failed: could not resolve ${from} on ${chain}`;
        if (callback) await callback({ text, actions: ["ORKID_DRY_RUN_SWAP"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }
      const tokenIn = token.address;
      const amountAtomic = BigInt(Math.floor(parseFloat(amount) * 10 ** token.decimals)).toString();

      // Dry run does not require a real permit/signature — the solver returns
      // calldata without submitting. We pass a minimal placeholder permit.
      const result = await client.dryRun({
        from,
        to,
        amount,
        chain,
        user,
        permit: {
          permitted: { token: tokenIn, amount: amountAtomic },
          nonce: "0",
          deadline: String(Math.floor(Date.now() / 1000) + 3600),
        },
        signature: "0x" + "00".repeat(65),
        slippageBps: opts.slippageBps ?? 50,
      });

      if (!result.ok) {
        const text = `Dry run failed: ${result.error || "unknown error"}`;
        if (callback) await callback({ text, actions: ["ORKID_DRY_RUN_SWAP"] });
        return { success: false, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      const q = result.quote;
      const tx = result.transaction;
      const text = [
        `**Dry Run (not executed)**`,
        q ? `${q.amountIn} ${from} → ${q.amountOut} ${to}` : "",
        q ? `Rate: ${q.rate}` : "",
        q ? `Protocol: ${q.protocol}` : "",
        `Gasless eligible: ${result.gaslessEligible ? "yes" : "no (user pays gas)"}`,
        tx ? `Target contract: ${tx.to}` : "",
        ``,
        `This was a dry run. No transaction was submitted.`,
      ].filter(Boolean).join("\n");

      if (callback)
        await callback({ text, actions: ["ORKID_DRY_RUN_SWAP"], data: result as any });
      return { success: true, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    } catch (error) {
      const text = `Dry run error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["ORKID_DRY_RUN_SWAP"] });
      return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: { text: "dry run 25 USDC to WETH on base", actions: [] },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Dry run complete: 25 USDC → 0.0102 WETH. Gasless eligible. No transaction submitted.",
          actions: ["ORKID_DRY_RUN_SWAP"],
        },
      },
    ],
  ],
};
