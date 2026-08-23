import { sha256 } from "./canonical";
import { callToolRaw, type ToolName } from "./tools";
import type { World } from "./types";

export type TranscriptEntry = {
  seq: number;
  agent: string;
  tool: ToolName;
  args_hash: string;
  result_hash: string;
};

/**
 * Records every tool call an agent makes. The verifier later checks that a
 * proposal's evidence actually appears here, so an agent cannot cite a tool
 * result it never ran.
 */
export class Transcript {
  readonly world: World;
  readonly entries: TranscriptEntry[] = [];
  private seq = 0;

  constructor(world: World) {
    this.world = world;
  }

  call(agent: string, tool: ToolName, args: Record<string, unknown>): unknown {
    const result = callToolRaw(this.world, tool, args);
    this.seq += 1;
    this.entries.push({
      seq: this.seq,
      agent,
      tool,
      args_hash: sha256(args),
      result_hash: sha256(result),
    });
    return result;
  }

  has(agent: string, tool: ToolName, args_hash: string, result_hash: string): boolean {
    return this.entries.some(
      (e) =>
        e.agent === agent &&
        e.tool === tool &&
        e.args_hash === args_hash &&
        e.result_hash === result_hash
    );
  }
}
