// A tool is a stateless-ish handler the Editor routes pointer events to. Tools read/write
// editor state through the Editor passed into each callback (type-only import avoids a
// runtime cycle). `dragPaints` tools take over the left mouse button (orbit moves to the
// right button while they're active).

import type { Editor } from './editor';

export interface Tool {
  readonly id: string;
  readonly label: string;
  /** Single-character/emoji glyph for the toolbar. */
  readonly icon: string;
  /** When true, left-drag is consumed by the tool (orbit camera uses right-drag). */
  readonly dragPaints: boolean;
  onActivate?(editor: Editor): void;
  onDeactivate?(editor: Editor): void;
  onPointerDown?(editor: Editor, ev: PointerEvent): void;
  onPointerMove?(editor: Editor, ev: PointerEvent): void;
  onPointerUp?(editor: Editor, ev: PointerEvent): void;
  /** Build the tool's options UI (shown in the left panel when active). */
  panel?(editor: Editor): HTMLElement;
}
