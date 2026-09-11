/**
 * orkidMarketDataProvider — gives the agent context about Orkid's
 * supported chains, status, and minimum notional requirements.
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { logger } from "@elizaos/core";
import { ORKID_CHAINS, ORKID_CHAIN_CONFIG, chainConfigFromName } from "@orkid-labs/sdk";
import { OrkidService } from "../service";

export const orkidMarketDataProvider: Provider = {
  name: "ORKID_MARKET_DATA",
  description:
    "Provides Orkid chain status, supported chains, and minimum notional requirements.",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<OrkidService>(OrkidService.serviceType);
      if (!service) {
        return {
          text: "Orkid service not available.",
          values: {},
          data: {},
        };
      }
      const client = service.getClient();

      let status: { ok: boolean; [key: string]: unknown } | null = null;
      try {
        status = await client.getStatus();
      } catch {
        logger.debug("Orkid status check failed (non-critical)");
      }

      const liveChains = ORKID_CHAINS.map((name) => {
        const cfg = chainConfigFromName(name);
        return `${name} (id ${cfg.id}, min $${cfg.minNotionalUsd})`;
      });

      const text = [
        `Orkid swap engine is available.`,
        `Supported chains: ${liveChains.join(", ")}.`,
        status?.ok ? "API status: healthy." : "API status: unknown.",
        `Quote (route) is non-billable. Execute (solve) is billable. Dry-run is non-billable.`,
        `Always get a quote before executing. Require explicit confirmation for live swaps.`,
      ].join(" ");

      return {
        text,
        values: {
          orkidChains: ORKID_CHAINS,
          orkidStatus: status?.ok ? "healthy" : "unknown",
        },
        data: {
          chains: ORKID_CHAINS,
          chainConfigs: ORKID_CHAINS.map((c) => ({
            name: c,
            id: chainConfigFromName(c).id,
            minNotionalUsd: chainConfigFromName(c).minNotionalUsd,
          })),
          status,
        },
      };
    } catch (error) {
      return {
        text: `Orkid provider error: ${error instanceof Error ? error.message : String(error)}`,
        values: {},
        data: {},
      };
    }
  },
};
