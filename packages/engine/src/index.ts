export * from './core/cards';
export * from './core/rng';
export * from './core/types';
export * from './core/table';
export * from './core/registry';
export * from './core/ai';
export * from './core/coach';

import { registerGame } from './core/registry';
import { chess } from './games/chess';
import { doudizhu } from './games/doudizhu';
import { gemguild } from './games/gemguild';
import { guandan } from './games/guandan';
import { hexisle } from './games/hexisle';
import { highcard } from './games/highcard';
import { gomoku } from './games/gomoku';
import { reversi } from './games/reversi';
import { g2048 } from './games/g2048';
import { mines } from './games/mines';
import { onecard } from './games/onecard';
import { sichuan } from './games/sichuan';
import { spellstones } from './games/spellstones';
import { texas } from './games/texas';
import { xiangqi } from './games/xiangqi';

export * as ddz from './games/doudizhu';
export * as gd from './games/guandan';
export * as tx from './games/texas';
export * as hc from './games/highcard';
export * as sc from './games/sichuan';
export * as ss from './games/spellstones';
export * as oc from './games/onecard';
export * as hi from './games/hexisle';
export * as gg from './games/gemguild';
export * as ch from './games/chess';
export * as xq from './games/xiangqi';
export * as gm from './games/gomoku';
export * as rv from './games/reversi';
export * as g2 from './games/g2048';
export * as ms from './games/mines';
export * as mj from './mahjong';

export {
  doudizhu,
  guandan,
  texas,
  sichuan,
  xiangqi,
  chess,
  spellstones,
  onecard,
  hexisle,
  gemguild,
  highcard,
  gomoku,
  reversi,
  g2048,
  mines,
};

// 内置玩法（顺序即大厅展示顺序）
for (const g of [
  doudizhu,
  guandan,
  texas,
  sichuan,
  xiangqi,
  chess,
  spellstones,
  onecard,
  hexisle,
  gemguild,
  highcard,
  gomoku,
  reversi,
  g2048,
  mines,
])
  registerGame(g);
