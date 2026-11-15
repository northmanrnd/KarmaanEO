# KarmaanEO 0.2.0

# KarmaanEO 0.2.0

Continue work when a provider subscription is exhausted. Open an editable continuation draft in the same workspace, choose a provider/model and review the locally retained history before sending. Draft handoff and history survive reloads. Source sessions remain unchanged.

Link existing agents as continuations, navigate in both directions and remove links. The daemon persists relationships and rejects cycles and cross-workspace links. Archived agents keep their relationships; remove links before moving individual agents between workspaces.

Includes the merged attachment restoration, full file-path copying, browser preference and compaction queue improvements.

History transfer uses retained text and tool summaries and can be shortened to the existing context budget. Only available attachment metadata is restored; missing image bytes block send until removed or replaced. This does not add provider account switching or native cross-provider transcript migration. The daemon must be restarted to activate continuation support. Apple Silicon local builds use ad-hoc signing and are not notarized.

Command–Shift–T recovery remains excluded while PR #6 has failing behavior checks.
