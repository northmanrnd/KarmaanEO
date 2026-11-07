# KarmaanEO 0.1.0

Initial independent KarmaanEO release line, based on Paseo 0.15.1.

- Retains the Markdown file-link fix and KarmaanEO desktop identity.
- Adds CLI moves for ordinary local workspaces and independent, idle agents.
- Adds independent versioning and desktop release automation.

Move restrictions: attached agent families and worktree project moves are rejected. Updating the app does not update an already-running daemon; activate during a planned restart. Automatic upstream updates remain disabled.

macOS builds are locally/ad-hoc signed, not Apple Developer ID signed or notarized. Release artifacts do not install themselves or restart running agents.
