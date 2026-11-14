import { expect, it } from "vitest";
import { dispatchPreferredLink } from "./link-destination";

it("routes links to the selected browser, uses the OS when unavailable, and rejects unsafe URLs", async () => {
  const opened: string[] = [];
  const ports = {
    openInApp: (url: string) => {
      opened.push(`app:${url}`);
    },
    openExternal: async (url: string) => {
      opened.push(`os:${url}`);
    },
  };
  await dispatchPreferredLink("https://example.com", "in-app", ports);
  await dispatchPreferredLink("https://example.com", "external", ports);
  await dispatchPreferredLink("https://example.com", "in-app", {
    openExternal: ports.openExternal,
  });
  await dispatchPreferredLink("javascript:alert(1)", "in-app", ports);
  expect(opened).toEqual([
    "app:https://example.com",
    "os:https://example.com",
    "os:https://example.com",
  ]);
});
