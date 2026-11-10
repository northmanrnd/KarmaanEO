# KarmaanEO 0.1.0

Initial independent KarmaanEO release line, based on Paseo 0.15.1.

- Retains the Markdown file-link fix and KarmaanEO desktop identity.
- Adds CLI moves for ordinary local workspaces and independent, idle agents.
- Adds independent versioning, release notes and immutable tags.

Move restrictions: attached agent families and worktree project moves are rejected. Updating the app does not update an already-running daemon; activate during a planned restart. Automatic upstream updates remain disabled.

Release entries record source versions; creating one does not build or install the app, or restart running agents.

Plugin requirements retain the Paseo 0.15.1 API baseline independently of the KarmaanEO product version.
