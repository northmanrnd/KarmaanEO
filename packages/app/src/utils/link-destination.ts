import { isHttpUrl } from "./http-url";

/** Local development links belong beside the workspace, regardless of the public-link preference. */
export function preferredLinkDestination(
  url: string,
  preference: "in-app" | "external",
): "in-app" | "external" {
  if (isHttpUrl(url)) {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "[::1]" ||
      /^127\.\d+\.\d+\.\d+$/.test(host)
    ) {
      return "in-app";
    }
  }
  return preference;
}

export async function dispatchPreferredLink(
  url: string,
  preference: "in-app" | "external",
  ports: {
    openInApp?: (url: string) => void;
    openExternal: (url: string) => Promise<void>;
  },
): Promise<void> {
  if (!isHttpUrl(url)) return;
  if (preferredLinkDestination(url, preference) === "in-app" && ports.openInApp) {
    ports.openInApp(url);
    return;
  }
  await ports.openExternal(url);
}
