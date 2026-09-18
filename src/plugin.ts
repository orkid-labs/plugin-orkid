/**
 * plugin-orkid — ElizaOS plugin for the Orkid gasless swap engine.
 *
 * Actions:
 *   ORKID_GET_QUOTE     — quote via /api/v1/route (non-billable)
 *   ORKID_EXECUTE_SWAP  — execute via /api/v1/solve (billable)
 *   ORKID_DRY_RUN_SWAP  — simulate via /api/v1/solve dryRun:true (non-billable)
 *   ORKID_LIST_TOKENS   — list tokens via /api/v1/tokens
 *   ORKID_GET_USAGE     — usage + rebates via /api/v1/usage + /api/v1/rebates
 *   ORKID_CONFIRM_TX    — confirm user-submitted tx via /api/v1/confirm
 *
 * Provider:
 *   ORKID_MARKET_DATA   — chain status and supported chains
 *
 * Service:
 *   OrkidService        — manages OrkidClient lifecycle
 */

import type { Plugin, ShortcutDefinition } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { z } from "zod";
import { OrkidService } from "./service";
import { getQuoteAction } from "./actions/getQuote";
import { executeSwapAction } from "./actions/executeSwap";
import { dryRunSwapAction } from "./actions/dryRunSwap";
import { listTokensAction } from "./actions/listTokens";
import { getUsageAction } from "./actions/getUsage";
import { confirmTxAction } from "./actions/confirmTx";
import { bridgeQuoteAction } from "./actions/bridgeQuote";
import { bridgeStatusAction } from "./actions/bridgeStatus";
import { orkidMarketDataProvider } from "./providers/marketData";
import { OrkidPluginTestSuite } from "./e2e/plugin-orkid.e2e";

const configSchema = z.object({
  ORKID_API_KEY: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn(
          "ORKID_API_KEY not set — anonymous calls may be rate-limited or blocked by anti-scraping."
        );
      }
      return val;
    }),
  ORKID_API_URL: z
    .string()
    .optional()
    .describe(
      "Orkid API base URL. Use 'sandbox' for sandbox mode (dry-run, no execution)."
    ),
  ORKID_USER_ADDRESS: z
    .string()
    .optional()
    .describe("Default user wallet address for swaps."),
});

export const orkidPlugin: Plugin = {
  name: "plugin-orkid",
  description:
    "Orkid gasless swap engine integration — quote, execute, dry-run, confirm, and track swaps via @orkid-labs/sdk.",
  config: {
    ORKID_API_KEY: process.env.ORKID_API_KEY ?? null,
    ORKID_API_URL: process.env.ORKID_API_URL ?? null,
    ORKID_USER_ADDRESS: process.env.ORKID_USER_ADDRESS ?? null,
  },

  async init(config: Record<string, string>) {
    logger.debug("plugin-orkid initializing");
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = String(value);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const msgs = error.issues?.map((e) => e.message).join(", ") || "unknown";
        throw new Error(`Invalid plugin-orkid configuration: ${msgs}`);
      }
      throw new Error(
        `Invalid plugin-orkid configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  actions: [
    getQuoteAction,
    executeSwapAction,
    dryRunSwapAction,
    listTokensAction,
    getUsageAction,
    confirmTxAction,
    bridgeQuoteAction,
    bridgeStatusAction,
  ],
  providers: [orkidMarketDataProvider],
  services: [OrkidService],
  shortcuts: [
    {
      id: "quote",
      kind: "explicit",
      aliases: ["/quote", "!quote"],
      target: { kind: "action", name: "ORKID_GET_QUOTE" },
    },
    {
      id: "dryrun",
      kind: "explicit",
      aliases: ["/dryrun", "!dryrun", "/dry-run", "!dry-run"],
      target: { kind: "action", name: "ORKID_DRY_RUN_SWAP" },
    },
    {
      id: "swap",
      kind: "explicit",
      aliases: ["/swap", "!swap"],
      target: { kind: "action", name: "ORKID_EXECUTE_SWAP" },
    },
  ] as ShortcutDefinition[],

  tests: [OrkidPluginTestSuite],

  async dispose(runtime) {
    await runtime.getService<OrkidService>(OrkidService.serviceType)?.stop();
  },
};

export default orkidPlugin;
