import type { Command } from "commander";
import { connectToDaemon } from "../../utils/client.js";
import type { CommandOptions, OutputSchema, SingleResult } from "../../output/index.js";

interface MoveResult {
  workspaceId: string;
  projectId: string;
}
const schema: OutputSchema<MoveResult> = {
  idField: "workspaceId",
  columns: [
    { header: "WORKSPACE ID", field: "workspaceId" },
    { header: "PROJECT ID", field: "projectId" },
  ],
};
export async function runMoveCommand(
  id: string,
  options: CommandOptions & { project?: string },
  _command: Command,
): Promise<SingleResult<MoveResult>> {
  if (!options.project) throw new Error("Missing --project");
  const client = await connectToDaemon({ target: options.daemonTarget });
  try {
    await client.moveWorkspace(id, options.project);
    return { type: "single", data: { workspaceId: id, projectId: options.project }, schema };
  } finally {
    await client.close();
  }
}
