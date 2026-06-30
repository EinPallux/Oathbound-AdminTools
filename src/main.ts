// Entry point: boot the editor + UI, and restore the autosave if one exists.

import './styles.css';
import { Editor } from './editor/editor';
import { EditorUI } from './editor/ui/app';
import { EditorState } from './editor/state';
import { loadAutosave } from './editor/storage';

const canvas = document.getElementById('viewport') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const editor = new Editor(canvas);
new EditorUI(editor, uiRoot);

// Expose for power users / tooling (console scripting, automated checks).
(window as unknown as { oathboundEditor: Editor }).oathboundEditor = editor;

// Restore the last session if present (non-fatal if it fails).
try {
  const raw = loadAutosave();
  if (raw) {
    const { state, heights, biomes, water } = EditorState.fromMap(raw);
    editor.loadState(state, heights, biomes, water);
    editor.setStatus(`Restored your last session “${state.name}”. New map to start fresh.`);
  }
} catch {
  /* ignore a bad autosave */
}
