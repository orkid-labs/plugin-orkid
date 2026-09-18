import type { Action, ActionResult, HandlerCallback, HandlerOptions, IAgentRuntime, Memory, State } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { OrkidService } from "../service";

const CHAIN_NAME: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  137: "polygon",
};

interface BridgeStatusOptions {
  txHash?: string;
  originChainId?: number;
  depositId?: string;
}

export const bridgeStatusAction: Action = {
  name: "ORKID_BRIDGE_STATUS",
  similes: [
    "BRIDGE_STATUS",
    "CHECK_BRIDGE",
    "DEPOSIT_STATUS",
    "BRIDGE_DEPOSIT_STATUS",
    "TRACK_BRIDGE",
  ],
  description:
    "Check a cross-chain bridge deposit lifecycle (pending|filled|expired|refunded) by origin transaction hash.",

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

      const opts = (options as BridgeStatusOptions) || {};
      const text0 = message.content.text || "";
      const txHash = opts.txHash || text0.match(/0x[a-fA-F0-9]{64}/)?.[0];

      if (!txHash && !(opts.originChainId && opts.depositId)) {
        const text =
          "I need the origin deposit transaction hash (or originChainId + depositId). Example: 'bridge status 0x…'";
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_STATUS"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      logger.info(`Orkid bridge status: ${txHash || `${opts.originChainId}/${opts.depositId}`}`);
      const result = await client.getBridgeStatus(
        txHash
          ? { depositTxnRef: txHash }
          : { originChainId: opts.originChainId, depositId: opts.depositId }
      );

      if (!result.ok || !result.deposit) {
        const text = `Bridge status lookup failed: ${result.error || "deposit not found"}`;
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_STATUS"] });
        return { success: false, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      const d = result.deposit;
      const status = String(d.status || "unknown");
      const dest = d.destinationChainId ? CHAIN_NAME[d.destinationChainId] || `chain ${d.destinationChainId}` : "destination";
      const fillTx = (d.fillTx || d.fillTxHash) as string | undefined;
      const refundTx = (d.depositRefundTxHash || d.refundTxHash) as string | undefined;

      const lines = [
        `**Bridge deposit status: ${status}**`,
        txHash ? `Deposit tx: ${txHash}` : `Deposit id: ${opts.depositId} (origin chain ${opts.originChainId})`,
      ];
      if (status === "filled") {
        lines.push(`Filled on ${dest}${fillTx ? ` — fill tx: ${fillTx}` : ""}`);
      } else if (status === "pending") {
        lines.push(`Waiting for a relayer to fill on ${dest}. Most fills complete in seconds.`);
      } else if (status === "expired") {
        lines.push(`Deposit expired — a refund will return to the depositor's wallet on the origin chain (can take a few hours).`);
      } else if (status === "refunded") {
        lines.push(`Refunded to the depositor${refundTx ? ` — refund tx: ${refundTx}` : ""}`);
      }
      const text = lines.join("\n");

      if (callback)
        await callback({ text, actions: ["ORKID_BRIDGE_STATUS"], data: result as any });
      return { success: true, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    } catch (error) {
      const text = `Bridge status error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["ORKID_BRIDGE_STATUS"] });
      return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    }
  },

  examples: [
    [
      { name: "{{userName}}", content: { text: "bridge status 0xda8148a536bb7ad22919c015595ac1a14cfb0884c7036cf54b3d9febdd94bc90" } },
      {
        name: "{{agentName}}",
        content: {
          text: "Bridge deposit status: filled — filled on destination chain.",
          actions: ["ORKID_BRIDGE_STATUS"],
        },
      },
    ],
  ],
};
