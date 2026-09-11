/**
 * OrkidService — manages the OrkidClient lifecycle for the agent runtime.
 *
 * Reads configuration from runtime settings and exposes a shared
 * OrkidClient instance that actions and providers can use.
 */

import type { IAgentRuntime } from "@elizaos/core";
import { logger, Service } from "@elizaos/core";
import { OrkidClient, SANDBOX_BASE_URL } from "@orkid-labs/sdk";

export class OrkidService extends Service {
  static serviceType = "orkid";
  capabilityDescription =
    "Manages the Orkid swap engine client — quote (route), execute (solve), dry-run, confirm, tokens, usage, and rebates via @orkid-labs/sdk.";

  private client: OrkidClient | null = null;

  static async start(runtime: IAgentRuntime): Promise<OrkidService> {
    const service = new OrkidService(runtime);
    service.initialize(runtime);
    return service;
  }

  async stop(): Promise<void> {
    this.client = null;
    logger.debug("OrkidService stopped");
  }

  private initialize(runtime: IAgentRuntime): void {
    const apiKeyRaw = runtime.getSetting("ORKID_API_KEY") || process.env.ORKID_API_KEY;
    const baseUrlRaw = runtime.getSetting("ORKID_API_URL") || process.env.ORKID_API_URL;
    const apiKey = apiKeyRaw ? String(apiKeyRaw) : undefined;
    const baseUrl = baseUrlRaw ? String(baseUrlRaw) : undefined;

    const resolvedBaseUrl = baseUrl === "sandbox" ? SANDBOX_BASE_URL : baseUrl;

    if (!apiKey) {
      logger.warn(
        "OrkidService: ORKID_API_KEY not set — anonymous calls may be rate-limited or blocked by anti-scraping."
      );
    }

    this.client = new OrkidClient({
      apiKey: apiKey || undefined,
      baseUrl: resolvedBaseUrl || undefined,
    });

    logger.info("OrkidService initialized");
  }

  /**
   * Get the shared OrkidClient. Throws if the service was not initialized.
   */
  getClient(): OrkidClient {
    if (!this.client) {
      throw new Error("OrkidService: client not initialized");
    }
    return this.client;
  }
}
