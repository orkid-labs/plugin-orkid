/**
 * ORKID_GET_USAGE — fetch partner account usage and rebates.
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

interface UsageOptions {
  period?: string;
  eventType?: "route" | "solve";
  limit?: number;
}

export const getUsageAction: Action = {
  name: "ORKID_GET_USAGE",
  similes: [
    "GET_USAGE",
    "ORKID_USAGE",
    "MY_VOLUME",
    "REBATE_STATUS",
    "ORKID_REBATES",
  ],
  description:
    "Fetch Orkid partner account usage, volume, and rebate status.",

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
    _message: Memory,
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

      const opts = (options as UsageOptions) || {};
      const period = opts.period;
      const eventType = opts.eventType;
      const limit = opts.limit ?? 20;

      logger.info(`Orkid usage: period=${period ?? "current"} type=${eventType ?? "all"}`);

      const [usage, rebates, account] = await Promise.all([
        client.getUsage({ period, eventType, limit }),
        client.getRebates({ period }),
        client.getAccount(),
      ]);

      const lines: string[] = [];

      if (account.ok && account.account) {
        lines.push(`**Account: ${account.account.name}** (${account.account.slug})`);
        lines.push(`Rebate rate: ${account.account.rebate_bps} bps`);
        lines.push(`Rebate active: ${account.account.rebate_active ? "yes" : "no"}`);
        lines.push("");
      }

      if (usage.ok) {
        lines.push(`**Usage${period ? ` (${period})` : ""}**`);
        lines.push(`Total volume: $${(usage.total_volume_usd ?? 0).toFixed(2)}`);
        lines.push(`Total savings: $${(usage.total_savings_usd ?? 0).toFixed(2)}`);
        const events = usage.events ?? [];
        lines.push(`Events: ${events.length} (showing ${Math.min(events.length, limit)})`);
        const solveEvents = events.filter(
          (e) => e.event_type === "solve" && !e.is_dry_run
        );
        lines.push(`Executed (billable) solves: ${solveEvents.length}`);
        lines.push("");
      }

      if (rebates.ok && rebates.rebates && rebates.rebates.length > 0) {
        lines.push(`**Rebates**`);
        for (const r of rebates.rebates) {
          lines.push(
            `${r.period}: $${r.volume_usd.toFixed(2)} volume → $${r.rebate_usd.toFixed(2)} rebate (${r.status})`
          );
        }
      }

      const text = lines.join("\n") || "No usage data available.";
      if (callback)
        await callback({ text, actions: ["ORKID_GET_USAGE"], data: { usage, rebates, account } as any });
      return { success: true, text, data: { usage, rebates, account } as any };
    } catch (error) {
      const text = `Usage error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["ORKID_GET_USAGE"] });
      return { success: false, text };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: { text: "what's my orkid volume this month?", actions: [] },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Your Orkid volume this month: $45,200.00. Rebate: $13.56 (accrued).",
          actions: ["ORKID_GET_USAGE"],
        },
      },
    ],
  ],
};
