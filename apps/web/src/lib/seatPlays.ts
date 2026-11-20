import { createContext, useContext } from 'react';
import type { PlayCard } from './actionNarrator';

/** 某个座位的最新一手（用于头像下方"本手牌"展示） */
export interface SeatPlay {
  /** 牌型/动作标签，如「顺子」「碰」「跟注」 */
  label: string;
  /** 本手具体牌面（扑克/麻将） */
  cards?: PlayCard[];
  /** 纯文字走子（象棋记谱/落点） */
  notation?: string;
  /** 该手发生时的版本，供动画 key 使用 */
  version: number;
}

export type SeatPlayMap = Record<number, SeatPlay>;

/** 由 TableShell 在顶层提供；各玩法的 Seat 通过 useSeatPlay(seat) 读取 */
export const SeatPlaysContext = createContext<SeatPlayMap>({});

export function useSeatPlays(): SeatPlayMap {
  return useContext(SeatPlaysContext);
}

export function useSeatPlay(seat: number | undefined): SeatPlay | null {
  const map = useSeatPlays();
  if (seat == null || seat < 0) return null;
  return map[seat] ?? null;
}
