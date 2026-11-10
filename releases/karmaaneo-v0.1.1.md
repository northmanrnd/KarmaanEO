# KarmaanEO 0.1.1

## Corrections

- Finder files and folders dropped into chats on this Mac stay attached as local paths. Local ZIPs no longer take a byte-upload detour or hit its 50 MB limit. Images keep their existing image attachment flow.
- The bundled CLI locates the renamed KarmaanEO Helper correctly.
- Upload failures remain visible beneath the composer instead of only flashing a toast.
- Codex output citations render as clickable links, including Google Docs links wrapped in citation attributes. Existing history uses the corrected rendering too. Literal examples in code and incomplete directives remain intact.

## Compatibility and limitations

macOS Apple Silicon. Remote-host and browser uploads retain the 50 MB limit; zip folders before uploading remotely. Local path attachments refer to the original files, which must remain accessible to the agent. No protocol or plugin API baseline change. Automatic upstream updates remain disabled. Publishing this release does not restart the running app or daemon.

## Validation

159 focused attachment/Markdown/terminal-drop tests and 11 packaging tests passed, plus browser ZIP upload/error and citation history reload checks. Typecheck, lint and 15 release tests passed. The built Apple Silicon app passed isolated native startup, bundled CLI/daemon/terminal checks and real Electron drops of a folder and a 51 MB ZIP.
