import { isHttpUrl } from "./http-url";

export async function dispatchPreferredLink(
  url: string,
  preference: "in-app" | "external",
  ports: {
    openInApp?: (url: string) => void;
    openExternal: (url: string) => Promise<void>;
  },
): Promise<void> {
  if (!isHttpUrl(url)) return;
  if (preference === "in-app" && ports.openInApp) {
    ports.openInApp(url);
    return;
  }
  await ports.openExternal(url);
}
