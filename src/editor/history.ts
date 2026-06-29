// Undo/redo as a stack of commands ({ undo, redo } closures). Terrain strokes record a
// sparse before/after of the touched cells; data edits snapshot the affected array.

export interface Command {
  label: string;
  undo: () => void;
  redo: () => void;
}

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly limit: number;
  onChange: (() => void) | null = null;

  constructor(limit = 60) {
    this.limit = limit;
  }

  push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.onChange?.();
  }

  /** Run `redo` immediately and record the command. */
  apply(cmd: Command): void {
    cmd.redo();
    this.push(cmd);
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange?.();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    this.undoStack.push(cmd);
    this.onChange?.();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange?.();
  }
}

/**
 * Records a sparse set of changed grid cells during a stroke and produces a Command that
 * restores old/new values. Works for both the height field (Float32Array) and the biome
 * field (Uint8Array).
 */
export class GridStroke {
  private readonly old = new Map<number, number>();
  constructor(
    private readonly target: Float32Array | Uint8Array,
    private readonly label: string,
    private readonly onRestore: () => void,
  ) {}

  /** Record a cell's pre-edit value (only the first time it's touched this stroke). */
  record(idx: number): void {
    if (!this.old.has(idx)) this.old.set(idx, this.target[idx]);
  }

  /** Build the command (call on stroke end). Returns null if nothing changed. */
  commit(): Command | null {
    const changed: [number, number, number][] = [];
    for (const [idx, oldVal] of this.old) {
      const newVal = this.target[idx];
      if (newVal !== oldVal) changed.push([idx, oldVal, newVal]);
    }
    if (!changed.length) return null;
    const target = this.target;
    const onRestore = this.onRestore;
    return {
      label: this.label,
      undo: () => {
        for (const [idx, oldVal] of changed) target[idx] = oldVal;
        onRestore();
      },
      redo: () => {
        for (const [idx, , newVal] of changed) target[idx] = newVal;
        onRestore();
      },
    };
  }
}
