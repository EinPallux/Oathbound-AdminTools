// The ordered tool palette. The Editor's default active tool is TOOLS[0].

import type { Tool } from '../tool';
import { sculptTool } from './sculpt';
import { flattenTool } from './flatten';
import { biomeTool } from './biome';
import { waterTool } from './water';
import { riverTool, roadTool } from './path';
import { assetTool } from './asset-place';
import { eraseTool } from './erase';
import { markersTool } from './markers-tool';
import { npcTool } from './npc-tool';
import { crittersTool } from './critters-tool';
import { selectTool } from './select';

export const TOOLS: Tool[] = [
  sculptTool,
  flattenTool,
  biomeTool,
  waterTool,
  riverTool,
  roadTool,
  assetTool,
  eraseTool,
  markersTool,
  npcTool,
  crittersTool,
  selectTool,
];
