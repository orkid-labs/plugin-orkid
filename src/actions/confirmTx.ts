/**
 * ORKID_CONFIRM_TX — confirm a user-submitted swap transaction.
 *
 * For swaps below the gasless floor, the user submits the calldata
 * themselves (user pays gas). This action confirms the tx on-chain
 * and makes it count as a real solve — rebate-eligible.
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
import { OrkidService } from "../service";

interface ConfirmOptions {
  txHash?: string;
  chain?: string;
}

function parseConfirmOptions(text: string): ConfirmOptions {
  const opts: ConfirmOptions = {};
  const hashMatch = text.match(/(0x[a-fA-F0-9]{64})/);
  const chainMatch = text.match(/(?:on|chain)\s+(\S+)/i);
  if (hashMatch) opts.txHash = hashMatch[1];
  if (chainMatch) opts.chain = chainMatch[1].toLowerCase();
  return opts;
}

export const confirmTxAction: Action = {
  name: "ORKID_CONFIRM_TX",
  similes: [
    "CONFIRM_TX",
    "CONFIRM_SWAP",
    "ORKID_CONFIRM",
    "VERIFY_TX",
  ],
  description:
    "Confirm a user-submitted swap transaction so it counts as a real solve and becomes rebate-eligible.",

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

      const opts = (options as ConfirmOptions) || {};
      const parsed = parseConfirmOptions(message.content.text || "");
      const txHash = opts.txHash || parsed.txHash;
      const chain = opts.chain || parsed.chain;

      if (!txHash) {
        const text =
          "I need a transaction hash to confirm. Example: 'confirm tx 0xabc... on base'";
        if (callback) await callback({ text, actions: ["ORKID_CONFIRM_TX"] });
        return { success: false, text };
      }

      logger.info(`Orkid confirm tx: ${txHash} on ${chain ?? "auto"}`);
      const result = await client.confirmTransaction(txHash, chain);

      if (!result.ok || !result.confirmed) {
        const text = `Confirmation failed: ${result.error || "tx not confirmed yet"}`;
        if (callback) await callback({ text, actions: ["ORKID_CONFIRM_TX"] });
        return { success: false, text, data: result as any };
      }

      const text = [
        `**Transaction Confirmed**`,
        `Tx: ${result.txHash || txHash}`,
        result.chain ? `Chain: ${result.chain}` : "",
        `Event ID: ${result.eventId ?? "n/a"}`,
        ``,
        `This swap now counts as billable volume for rebates.`,
      ].filter(Boolean).join("\n");

      if (callback)
        await callback({ text, actions: ["ORKID_CONFIRM_TX"], data: result as any });
      return { success: true, text, data: result as any };
    } catch (error) {
      const text = `Confirm error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["ORKID_CONFIRM_TX"] });
      return { success: false, text };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: {
          text: "confirm tx 0xabc123... on base",
          actions: [],
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Transaction confirmed. Event ID: 42. This counts as billable volume.",
          actions: ["ORKID_CONFIRM_TX"],
        },
      },
    ],
  ],
};
