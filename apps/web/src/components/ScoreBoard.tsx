import { SCORE_NOTICE } from '@park/protocol';
import type { MatchScore, RoomScoreRow, ScoreSummary } from '@park/protocol';
import { ChevronDown, Trophy } from 'lucide-react';
import { useState } from 'react';
import { SCORE_GAME_LABEL } from '../lib/scoreLabel';
import { PixelAvatar } from './pixel/PixelAvatar';
import './score.css';

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `${n}` : '±0';
}

function tone(n: number): string {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
}

/** 一局的结算卡：谁赢谁输、依据是什么、累计到多少 */
export function MatchScoreCard({
  match,
  seat,
  onDismiss,
}: {
  match: MatchScore;
  seat: number | null;
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const mine = seat === null ? undefined : match.rows.find((r) => r.seat === seat);
  const best = match.rows.reduce((a, r) => Math.max(a, r.delta), -Infinity);

  if (!open) {
    return (
      <button className="score-chip" onClick={() => setOpen(true)} type="button">
        <Trophy size={14} />
        <span>本局</span>
        {mine ? (
          <b className={tone(mine.delta)}>
            {signed(mine.delta)}
            <small>{match.unit}</small>
          </b>
        ) : (
          <b>{match.unit}已结算</b>
        )}
      </button>
    );
  }

  return (
    <section className="score-card" aria-label="本局娱乐分结算">
      <header className="score-card__head">
        <div>
          <h3>本局结算</h3>
          <p>
            {SCORE_GAME_LABEL[match.gameId] ?? match.gameId} · {match.basis}
          </p>
        </div>
        <button
          className="score-card__fold"
          type="button"
          onClick={() => setOpen(false)}
          aria-label="收起结算"
        >
          <ChevronDown size={16} />
        </button>
      </header>

      {!match.counted && <p className="score-card__hint">这套玩法没有可结算的数据，本局不计分。</p>}

      <ul className="score-card__rows">
        {match.rows.map((r) => (
          <li
            key={r.seat}
            className={[
              'score-row',
              r.seat === seat ? 'me' : '',
              r.delta === best && r.delta > 0 ? 'top' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <PixelAvatar avatar={r.avatar} name={r.name ?? '?'} size={26} />
            <span className="score-row__name">
              {r.name ?? `座 ${r.seat + 1}`}
              {r.seat === seat && <small>我</small>}
            </span>
            <b className={`score-row__delta ${tone(r.delta)}`}>
              {signed(r.delta)}
              <small>{match.unit}</small>
            </b>
            <span className="score-row__total">
              {r.total === null ? '—' : `累计 ${r.total}`}
            </span>
          </li>
        ))}
      </ul>

      <footer className="score-card__foot">
        <span>{SCORE_NOTICE}</span>
        {onDismiss && (
          <button type="button" onClick={onDismiss}>
            知道了
          </button>
        )}
      </footer>
    </section>
  );
}

/** 等待房间里的"这一桌"累计分表 */
export function RoomScoreTable({
  rows,
  unit = '分',
  title = '这一桌的娱乐分',
}: {
  rows: RoomScoreRow[];
  unit?: string;
  title?: string;
}) {
  if (!rows.length) return null;
  const best = rows.reduce((a, r) => Math.max(a, r.session), -Infinity);
  return (
    <section className="score-table">
      <header>
        <h3>{title}</h3>
        <p>本次进房以来累计，仅作牌局记录</p>
      </header>
      <ul>
        {rows.map((r) => (
          <li key={r.seat} className={r.session === best && r.session > 0 ? 'top' : ''}>
            <PixelAvatar avatar={r.avatar} name={r.name ?? '?'} size={22} />
            <span>{r.name ?? `座 ${r.seat + 1}`}</span>
            <b className={tone(r.session)}>
              {signed(r.session)}
              <small>{unit}</small>
            </b>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 个人档案小卡：总分 / 局数 / 胜局 */
export function MyScoreCard({ summary }: { summary: ScoreSummary | null }) {
  if (!summary || summary.matches === 0)
    return (
      <section className="score-me">
        <h3>我的娱乐分</h3>
        <b className="score-me__total">0</b>
        <p>还没打过牌。娱乐分只记录输赢，不能充值或兑换。</p>
      </section>
    );

  const games = Object.entries(summary.byGame).sort((a, b) => b[1].matches - a[1].matches);
  return (
    <section className="score-me">
      <h3>我的娱乐分</h3>
      <b className={`score-me__total ${tone(summary.total)}`}>{summary.total}</b>
      <p>
        共 {summary.matches} 局 · 胜 {summary.wins} 局
      </p>
      {games.length > 0 && (
        <ul>
          {games.slice(0, 4).map(([id, v]) => (
            <li key={id}>
              <span>{SCORE_GAME_LABEL[id] ?? id}</span>
              <b className={tone(v.total)}>{signed(v.total)}</b>
              <small>{v.matches} 局</small>
            </li>
          ))}
        </ul>
      )}
      <footer>{SCORE_NOTICE}</footer>
    </section>
  );
}
