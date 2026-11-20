import type { mjx } from '@park/engine';
import { useState } from 'react';
import { Button, Sheet } from '../../components/ui';
import { FaceByIndex } from '../../components/MahjongTile';
import type { GameController } from '../../lib/controller';
import { callout } from '../../lib/callout';
import { Seat } from '../../components/Seat';
import './majiang.css';

type Ctl = GameController<mjx.MjView, mjx.MjAction>;
const SUIT_TXT = ['万', '条', '筒'];
const honor = ['东', '南', '西', '北', '中', '发', '白'];

/** 三个地域变体的特色：一眼分清当前打的是哪一桌规则 */
const REGION_TAG: Record<string, { name: string; trait: string }> = {
  guangdong: { name: '广东推倒胡', trait: '可吃可碰' },
  changsha: { name: '长沙红中', trait: '红中赖子' },
  guobiao: { name: '国标麻将', trait: '番种计分' },
};

export function tileText(t: number): string {
  if (t >= 27) return honor[t - 27] ?? '?';
  return `${(t % 9) + 1}${SUIT_TXT[Math.floor(t / 9)]}`;
}

function tileSuit(t: number): 'wan' | 'tiao' | 'tong' | 'honor' {
  if (t >= 27) return 'honor';
  return (['wan', 'tiao', 'tong'] as const)[Math.floor(t / 9)];
}

/** 找一组能用手上两张牌 + 最后一张牌吃成的顺子 */
function findChi(hand: number[], t: number): [number, number] | null {
  if (t >= 27) return null;
  const base = Math.floor(t / 9) * 9;
  const rank = t % 9;
  for (const [a, b] of [[rank - 2, rank - 1], [rank - 1, rank + 1], [rank + 1, rank + 2]]) {
    if (a < 0 || b < 0 || a > 8 || b > 8) continue;
    const i = hand.indexOf(base + a);
    if (i < 0) continue;
    const j = hand.findIndex((v, idx) => idx !== i && v === base + b);
    if (j >= 0) return i < j ? [i, j] : [j, i];
  }
  return null;
}

/** 一张牌面：矢量花纹（筒饼/竹节/万字/字牌），与川麻同源，缩到 20px 也认得出 */
function Tile({ t, small, back }: { t: number; small?: boolean; back?: boolean }) {
  if (back) return <i className={`mj__back${small ? ' is-small' : ''}`} />;
  return (
    <span className={`mj__face suit-${tileSuit(t)}${small ? ' is-small' : ''}`}>
      <FaceByIndex t={t} />
    </span>
  );
}

export default function MajiangBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const [sel, setSel] = useState<number | null>(null);
  const myTurn = v.seat !== null && v.turn === v.seat && !v.over;
  const hand = v.seat !== null ? v.hands[v.seat] : [];
  const chi = v.last && v.seat !== null ? findChi(hand, v.last.tile) : null;

  const seat = v.seat ?? 0;
  const rel = (n: number) => (seat + n) % 4;
  const right = rel(1);
  const top = rel(2);
  const left = rel(3);

  const discard = (i: number) => {
    if (!myTurn) return;
    ctl.act({ type: 'discard', tile: i });
    setSel(null);
  };

  const Opp = ({ s, place }: { s: number; place: 'top' | 'left' | 'right' }) => {
    const p = ctl.players[s];
    const pile = v.discards[s] ?? [];
    // 形象在外侧、信息在内侧，与川麻 seatBlock 完全一致的方位语义
    const side = place;
    return (
      <div className={`mj__opp is-${place}${v.turn === s ? ' is-turn' : ''}`}>
        <Seat
          player={p}
          seat={s}
          active={v.turn === s && !v.over}
          deadline={ctl.deadlines[s]}
          size={place === 'top' ? 46 : 40}
          layout={place === 'top' ? 'row' : 'column'}
          side={side}
          sub={`${v.hands[s]?.length ?? 0} 张`}
        />
        <div className="mj__opp-hand">
          {Array.from({ length: Math.min(v.hands[s]?.length ?? 0, 13) }, (_, i) => (
            <Tile key={i} t={0} back small />
          ))}
        </div>
        <div className={`mj__river is-${place}`}>
          {pile.map((t, i) => (
            <Tile key={i} t={t} small />
          ))}
        </div>
        {v.melds[s]?.length > 0 && (
          <div className="mj__opp-melds">
            {v.melds[s].map((m, i) => (
              <span key={i}>
                {m.map((t, j) => (
                  <Tile key={j} t={t} small />
                ))}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mj">
      <div className="mj__table">
        <div className="mj__area-top">
          <Opp s={top} place="top" />
        </div>
        <div className="mj__area-left">
          <Opp s={left} place="left" />
        </div>
        <div className="mj__center">
          {(() => {
            const tag = REGION_TAG[v.options?.region ?? ''] ?? { name: '麻将', trait: '四家竞技' };
            return (
              <div className="mj__variant" title={tag.trait}>
                <b>{tag.name}</b>
                <small>{tag.trait}</small>
              </div>
            );
          })()}
          <div className="mj__compass">
            <i className={v.turn === seat ? 'is-on' : ''}>我</i>
            <i className={v.turn === right ? 'is-on' : ''}>下</i>
            <i className={v.turn === top ? 'is-on' : ''}>对</i>
            <i className={v.turn === left ? 'is-on' : ''}>上</i>
          </div>
          <div className="mj__wall">
            <small>余牌</small>
            <b>{v.wall}</b>
          </div>
          {v.last && (
            <div className="mj__last">
              <small>刚打出</small>
              <Tile t={v.last.tile} />
            </div>
          )}
        </div>
        <div className="mj__area-right">
          <Opp s={right} place="right" />
        </div>
        <div className="mj__area-bottom">
          <div className="mj__mine">
            <div className="mj__mine-head">
              <Seat
                player={ctl.players[seat]}
                seat={seat}
                metaOnly
                layout="row"
                sub={`${hand.length} 张`}
              />
              {v.melds[seat]?.length > 0 && (
                <span className="mj__mine-melds">
                  {v.melds[seat].map((m, i) => (
                    <em key={i}>
                      {m.map((t, j) => (
                        <Tile key={j} t={t} small />
                      ))}
                    </em>
                  ))}
                </span>
              )}
              <small>{myTurn ? '轮到你出牌' : v.over ? '本局结束' : '等别家'}</small>
            </div>
            {v.discards[seat]?.length > 0 && (
              <div className="mj__river is-bottom">
                {v.discards[seat].map((t, i) => (
                  <Tile key={i} t={t} small />
                ))}
              </div>
            )}
            <div className="mj__hand" role="group" aria-label="我的手牌">
              {hand.map((t, i) => (
                <button
                  key={`${t}-${i}`}
                  className={`mj__tile suit-${tileSuit(t)}${sel === i ? ' is-on' : ''}`}
                  onClick={() => setSel(sel === i ? null : i)}
                  aria-label={tileText(t)}
                >
                  <FaceByIndex t={t} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mj__ops">
        {sel !== null && myTurn && (
          <Button variant="primary" onClick={() => discard(sel)}>
            打出 {tileText(hand[sel])}
          </Button>
        )}
        {v.last && v.seat !== null && !v.over && (
          <>
            {v.can.hu && (
              <Button variant="primary" onClick={() => { ctl.act({ type: 'hu' }); callout('胡了'); }}>
                胡
              </Button>
            )}
            {v.can.gang && <Button onClick={() => { ctl.act({ type: 'gang' }); callout('杠'); }}>杠</Button>}
            {v.can.peng && <Button onClick={() => { ctl.act({ type: 'peng' }); callout('碰'); }}>碰</Button>}
            {v.can.chi && chi && (
              <Button onClick={() => { ctl.act({ type: 'chi', tiles: chi }); callout('吃'); }}>吃</Button>
            )}
            <Button onClick={() => ctl.act({ type: 'pass' })}>过</Button>
          </>
        )}
      </div>

      <Sheet
        open={v.over}
        dismissible={false}
        title={v.winner === v.seat ? '你胡了' : '本局结束'}
        footer={
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            <Button variant="primary" onClick={() => ctl.act({ type: 'ready' })}>再来一局</Button>
          </>
        }
      >
        <p className="mj__result">{v.huType || '流局：牌墙摸完'}</p>
      </Sheet>
    </div>
  );
}
