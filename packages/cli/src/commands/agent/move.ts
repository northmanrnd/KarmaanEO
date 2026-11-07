import type { Command } from "commander";
import { connectToDaemon } from "../../utils/client.js";
import type { CommandOptions, OutputSchema, SingleResult } from "../../output/index.js";

interface MoveResult {
  agentId: string;
  workspaceId: string;
}
const schema: OutputSchema<MoveResult> = {
  idField: "agentId",
  columns: [
    { header: "AGENT ID", field: "agentId" },
    { header: "WORKSPACE ID", field: "workspaceId" },
  ],
};
export async function runMoveCommand(
  id: string,
  options: CommandOptions & { workspace?: string },
  _command: Command,
): Promise<SingleResult<MoveResult>> {
  if (!options.workspace) throw new Error("Missing --workspace");
  const client = await connectToDaemon({ target: options.daemonTarget });
  try {
    await client.moveAgent(id, options.workspace);
    return { type: "single", data: { agentId: id, workspaceId: options.workspace }, schema };
  } finally {
    await client.close();
  }
}
