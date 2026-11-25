import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  desktop: true,
  preference: "external" as "external" | "in-app",
  workspaces: new Map([
    ["root", { id: "root", workspaceDirectory: "/work" }],
    ["nested", { id: "nested", workspaceDirectory: "/work/app" }],
  ]),
  create: vi.fn(() => ({ browserId: "browser" })),
  navigate: vi.fn(),
  external: vi.fn(async (_url: string) => {}),
}));
vi.mock("@/desktop/host", () => ({ isElectronRuntime: () => state.desktop }));
vi.mock("@/hooks/use-settings", () => ({
  loadAppSettingsFromStorage: async () => ({ linkBrowser: state.preference }),
}));
vi.mock("@/stores/session-store", () => ({
  useSessionStore: { getState: () => ({ sessions: { local: { workspaces: state.workspaces } } }) },
}));
vi.mock("@/desktop/browser/store", () => ({ createWorkspaceBrowser: state.create }));
vi.mock("@/stores/navigation-active-workspace-store", () => ({
  navigateToWorkspace: state.navigate,
}));
vi.mock("./open-external-url", () => ({ openExternalUrl: state.external }));
import { openPreferredLink } from "./open-preferred-link";

beforeEach(() => {
  vi.clearAllMocks();
  state.desktop = true;
  state.preference = "external";
});

it("opens localhost from a chat or terminal cwd in the closest workspace", async () => {
  await openPreferredLink("http://localhost:3000", {
    serverId: "local",
    workspaceRoot: "/work/app/src",
  });
  expect(state.create).toHaveBeenCalledWith({ initialUrl: "http://localhost:3000" });
  expect(state.navigate).toHaveBeenCalledWith({
    serverId: "local",
    workspaceId: "nested",
    target: { kind: "browser", browserId: "browser" },
  });
  expect(state.external).not.toHaveBeenCalled();
});

it("preserves public link preferences and uses the OS when no workspace browser is available", async () => {
  await openPreferredLink("https://example.com", { serverId: "local", workspaceRoot: "/work" });
  await openPreferredLink("http://localhost:3000", {
    serverId: "local",
    workspaceRoot: "/unknown",
  });
  state.desktop = false;
  await openPreferredLink("http://127.0.0.1:3000", { serverId: "local", workspaceRoot: "/work" });
  expect(state.external.mock.calls.map(([url]) => url)).toEqual([
    "https://example.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  expect(state.create).not.toHaveBeenCalled();
});
