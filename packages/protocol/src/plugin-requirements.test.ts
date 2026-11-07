import { describe, expect, it } from "vitest";
import {
  assertPluginCompatibility,
  validatePluginRequirements,
  PASEO_PLUGIN_API_VERSION,
} from "./plugin-requirements.js";

describe.each(["daemon", "app"] as const)("plugin requirements on %s", (runtime) => {
  it("rejects legacy manifests on the first breaking release with migration instructions", () => {
    expect(() => assertPluginCompatibility({ id: "legacy", version: "0.8.0", runtime })).toThrow(
      /legacy.*<0\.8\.0.*0\.8\.0.*https:\/\/paseo.sh\/docs\/plugins\/migration/,
    );
  });

  it.each([
    [undefined, "0.7.2"],
    [">=0.8.0", "0.8.0"],
    [">=0.8.0", "0.8.0-beta.1"],
    [">=0.8.0", "1.0.0"],
    ["^0.8.0", "0.8.4"],
    [">=0.8.0-beta.1", "0.8.0-beta.2"],
    [">=0.8.0-beta.1", "0.8.0-beta.1"],
    [">=0.8.0-beta.1", "0.8.0"],
    ["^0.8.0 || ^0.9.0", "0.9.2+build.42"],
  ])("accepts %s on %s", (paseo, version) => {
    expect(() =>
      assertPluginCompatibility({ id: "test", requirements: { paseo }, version, runtime }),
    ).not.toThrow();
  });

  it.each([
    [undefined, "0.8.0-beta.1"],
    [undefined, "0.9.0"],
    [">=0.8.0", "0.7.2"],
    ["^0.8.0", "0.9.0"],
    ["<0.8.0", "0.8.0-beta.1"],
  ])("rejects %s on %s", (paseo, version) => {
    expect(() =>
      assertPluginCompatibility({ id: "test", requirements: { paseo }, version, runtime }),
    ).toThrow(`Your ${runtime} is ${version}`);
  });

  it.each(["", "   ", "latest", ">=potato", "0.8.0 nonsense"])(
    "rejects malformed range %s",
    (paseo) => {
      expect(() => validatePluginRequirements({ paseo })).toThrow("Invalid requirements.paseo");
    },
  );

  it.each([null, "unknown"])("fails closed when the runtime version is %s", (version) => {
    expect(() =>
      assertPluginCompatibility({
        id: "test",
        requirements: { paseo: "*" },
        version,
        runtime,
      }),
    ).toThrow(`Paseo ${runtime} version is unknown`);
  });
});

describe("KarmaanEO plugin API compatibility", () => {
  it("accepts the retained provider API while rejecting newer and legacy APIs", () => {
    for (const runtime of ["daemon", "app"] as const) {
      const input = { id: "provider", version: PASEO_PLUGIN_API_VERSION, runtime };
      expect(() =>
        assertPluginCompatibility({ ...input, requirements: { paseo: ">=0.10.0" } }),
      ).not.toThrow();
      expect(() =>
        assertPluginCompatibility({ ...input, requirements: { paseo: ">=0.16.0" } }),
      ).toThrow();
      expect(() => assertPluginCompatibility(input)).toThrow(/migration/);
    }
  });
});
