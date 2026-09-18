import type { Action, ActionResult, HandlerCallback, HandlerOptions, IAgentRuntime, Memory, State } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { OrkidService } from "../service";

const CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  base: 8453,
  arbitrum: 42161,
  arb: 42161,
  polygon: 137,
  pol: 137,
};

interface BridgeQuoteOptions {
  from?: string;
  to?: string;
  amount?: string;
  originChain?: string;
  destChain?: string;
  depositor?: string;
}

// "bridge 25 USDC from base to arbitrum" / "bridge 0.5 ETH ethereum -> base"
function parseBridgeOptions(text: string): BridgeQuoteOptions {
  const clean = text.replace(/["'`]/g, "").trim();
  const opts: BridgeQuoteOptions = {};
  const amountMatch = clean.match(/(?:bridge|send|move)\s+([\d.]+)\s+(\S+)/i);
  if (amountMatch) {
    opts.amount = amountMatch[1];
    opts.from = amountMatch[2];
  }
  const toMatch = clean.match(/(?:to|into|for)\s+(\S+)(?:\s|$)/i);
  const fromChainMatch = clean.match(/from\s+([a-z]+)\s+to/i);
  const destChainMatch = clean.match(/to\s+([a-z]+)(?:\s|$)/i);
  const chainArrow = clean.match(/([a-z]+)\s*(?:->|→|to)\s*([a-z]+)/i);
  const depositorMatch = clean.match(/0x[a-fA-F0-9]{40}/);
  if (toMatch && !opts.to) opts.to = toMatch[1];
  if (fromChainMatch) opts.originChain = fromChainMatch[1].toLowerCase();
  if (destChainMatch && CHAIN_ID[destChainMatch[1].toLowerCase()]) {
    opts.destChain = destChainMatch[1].toLowerCase();
  } else if (chainArrow && CHAIN_ID[chainArrow[2].toLowerCase()]) {
    opts.destChain = chainArrow[2].toLowerCase();
  }
  if (chainArrow && CHAIN_ID[chainArrow[1].toLowerCase()]) opts.originChain = chainArrow[1].toLowerCase();
  if (depositorMatch) opts.depositor = depositorMatch[0];
  return opts;
}

export const bridgeQuoteAction: Action = {
  name: "ORKID_BRIDGE_QUOTE",
  similes: [
    "BRIDGE_QUOTE",
    "QUOTE_BRIDGE",
    "CROSS_CHAIN",
    "BRIDGE_TOKENS",
    "MOVE_TOKENS_CROSS_CHAIN",
  ],
  description:
    "Get a cross-chain bridge quote via Orkid (Across). Quote only — the user signs the deposit transaction from their own wallet; Orkid never custodies funds.",

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

      const opts = (options as BridgeQuoteOptions) || {};
      const parsed = parseBridgeOptions(message.content.text || "");
      const from = opts.from || parsed.from;
      const to = opts.to || parsed.to;
      const amount = opts.amount || parsed.amount;
      const originName = (opts.originChain || parsed.originChain || "base").toLowerCase();
      const destName = (opts.destChain || parsed.destChain || "").toLowerCase();
      const depositor = String(opts.depositor || parsed.depositor || runtime.getSetting("ORKID_USER_ADDRESS") || "");

      const originChainId = CHAIN_ID[originName];
      const destChainId = CHAIN_ID[destName];

      if (!from || !to || !amount || !destChainId) {
        const text =
          "I need the token, amount, and destination chain. Example: 'bridge 25 USDC from base to arbitrum'";
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }
      if (!originChainId) {
        const text = `Unsupported origin chain: ${originName}. Bridge chains: ethereum, base, arbitrum, polygon`;
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }
      if (originChainId === destChainId) {
        const text = "Origin and destination are the same chain — that's a same-chain swap, not a bridge. Try 'quote ... on base' instead.";
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }
      if (!depositor) {
        const text =
          "Bridge quotes need the depositor wallet (it signs the deposit and receives any refund). Set ORKID_USER_ADDRESS or include the address.";
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      // Resolve symbols to curated bridge token addresses (quote wants exact
      // amounts in base units — resolve decimals from the tokens endpoint).
      const [originTokens, destTokens] = await Promise.all([
        client.getBridgeTokens(originChainId),
        client.getBridgeTokens(destChainId),
      ]);
      const norm = (s: string) => s.toLowerCase();
      const inTok = (originTokens.tokens || []).find(
        (t) => norm(t.symbol) === norm(from) || norm(t.address) === norm(from)
      );
      const outTok = (destTokens.tokens || []).find(
        (t) => norm(t.symbol) === norm(to) || norm(t.address) === norm(to)
      );
      if (!inTok) {
        const text = `${from} isn't a curated bridge token on ${originName}. Supported: ${(originTokens.tokens || []).map((t) => t.symbol).join(", ")}`;
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }
      if (!outTok) {
        const text = `${to} isn't a curated bridge token on ${destName}. Supported: ${(destTokens.tokens || []).map((t) => t.symbol).join(", ")}`;
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"] });
        return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      const [whole, frac = ""] = amount.split(".");
      const amountRaw = (BigInt(whole || "0") * 10n ** BigInt(inTok.decimals) +
        BigInt((frac + "0".repeat(inTok.decimals)).slice(0, inTok.decimals) || "0")).toString();

      logger.info(`Orkid bridge quote: ${amount} ${inTok.symbol} ${originName} → ${outTok.symbol} ${destName}`);
      const result = await client.getBridgeQuote({
        originChainId,
        destinationChainId: destChainId,
        inputToken: inTok.address,
        outputToken: outTok.address,
        amount: amountRaw,
        depositor,
        recipient: depositor,
        slippage: "auto",
      });

      if (!result.ok || !result.quote) {
        const text = `Bridge quote failed: ${result.error || "unknown error"}`;
        if (callback) await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"] });
        return { success: false, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
      }

      const q = result.quote;
      const fmt = (raw: string, dec: number) => {
        const v = Number(raw) / 10 ** dec;
        return v.toLocaleString(undefined, { maximumSignificantDigits: 8 });
      };
      const text = [
        `**Bridge quote (non-executed)**`,
        `${amount} ${inTok.symbol} on ${originName} → ${fmt(q.expectedOutputAmount, outTok.decimals)} ${outTok.symbol} on ${destName}`,
        `Guaranteed minimum: ${fmt(q.minOutputAmount, outTok.decimals)} ${outTok.symbol}`,
        q.expectedFillTime != null ? `Estimated fill: ~${q.expectedFillTime}s` : undefined,
        `Approvals needed first: ${q.approvalTxns.length}`,
        `Quote expires: ${new Date(q.quoteExpiryTimestamp * 1000).toISOString()}`,
        ``,
        `Non-custodial: your wallet signs the approval + deposit directly — Orkid never holds funds.`,
        `If the deposit can't be filled, it's refunded to your wallet on ${originName} (can take a few hours).`,
        `To execute, sign the returned approvalTxns then swapTx from ${depositor.slice(0, 6)}…${depositor.slice(-4)}.`,
      ].filter(Boolean).join("\n");

      if (callback)
        await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"], data: result as any });
      return { success: true, text, data: { ...(result as any || {}), suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    } catch (error) {
      const text = `Bridge quote error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["ORKID_BRIDGE_QUOTE"] });
      return { success: false, text, data: { suppressPlannerReply: true }, userFacingText: text, verifiedUserFacing: true };
    }
  },

  examples: [
    [
      { name: "{{userName}}", content: { text: "bridge 25 USDC from base to arbitrum" } },
      {
        name: "{{agentName}}",
        content: {
          text: "Bridge quote (non-executed): 25 USDC on base → USDC on arbitrum. Guaranteed minimum shown; your wallet signs the deposit directly — Orkid never holds funds.",
          actions: ["ORKID_BRIDGE_QUOTE"],
        },
      },
    ],
    [
      { name: "{{userName}}", content: { text: "how much WETH would I get bridging 0.01 ETH ethereum -> base" } },
      {
        name: "{{agentName}}",
        content: { text: "Bridge quote (non-executed): cross-chain quote with guaranteed minimum and estimated fill time.", actions: ["ORKID_BRIDGE_QUOTE"] },
      },
    ],
  ],
};
