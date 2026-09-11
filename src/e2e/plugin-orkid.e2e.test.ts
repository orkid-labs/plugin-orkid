/**
 * Vitest adapter for running the plugin-orkid TestSuite against an
 * in-memory runtime.
 */

import { describe, it } from "vitest";
import { cleanupTestRuntime, createTestRuntime } from "../__tests__/test-utils";
import plugin from "../plugin";
import { OrkidPluginTestSuite } from "./plugin-orkid.e2e";

describe(OrkidPluginTestSuite.name, () => {
  for (const suiteTest of OrkidPluginTestSuite.tests) {
    it(suiteTest.name, async () => {
      const runtime = await createTestRuntime({
        character: { name: "Eliza" },
        plugins: [plugin],
      });

      try {
        await suiteTest.fn(runtime);
      } finally {
        await cleanupTestRuntime(runtime);
      }
    });
  }
});
