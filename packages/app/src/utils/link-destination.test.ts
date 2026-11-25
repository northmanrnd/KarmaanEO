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

it("keeps loopback development URLs in the workspace even with an external public-link preference", async () => {
  const opened: string[] = [];
  const ports = {
    openInApp: (url: string) => {
      opened.push(`app:${url}`);
    },
    openExternal: async (url: string) => {
      opened.push(`os:${url}`);
    },
  };
  for (const url of [
    "http://localhost:3000",
    "http://127.0.0.1:8080",
    "http://127.2.3.4:9000",
    "http://[::1]:3000",
    "https://app.localhost:444",
  ]) {
    await dispatchPreferredLink(url, "external", ports);
    expect(opened.at(-1)).toBe(`app:${url}`);
  }
  for (const url of [
    "https://localhost.example.com",
    "https://example.com/localhost",
    "https://localhost@evil.example",
  ]) {
    await dispatchPreferredLink(url, "external", ports);
    expect(opened.at(-1)).toBe(`os:${url}`);
  }
  await dispatchPreferredLink("http://localhost:3000", "external", {
    openExternal: ports.openExternal,
  });
  expect(opened.at(-1)).toBe("os:http://localhost:3000");
});
