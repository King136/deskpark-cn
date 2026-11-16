/**
 * 出牌飞行：把被点击的牌克隆一份，从手牌位置过渡到牌桌落点。
 * 用 DOM 克隆而不是 React 状态，出牌后原节点立刻卸载也不会打断动画。
 */
export function flyCards(nodes: HTMLElement[], target: DOMRect | null, ms = 260): void {
  if (!nodes.length || !target) return;
  const layer = document.createElement('div');
  layer.className = 'fly-layer';
  document.body.appendChild(layer);

  const to = { x: target.left + target.width / 2, y: target.top + target.height / 2 };

  nodes.forEach((node, i) => {
    const r = node.getBoundingClientRect();
    if (!r.width) return;
    const ghost = node.cloneNode(true) as HTMLElement;
    ghost.className = `${node.className} is-ghost`;
    ghost.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:${70 + i};transition:transform ${ms}ms cubic-bezier(.22,.9,.3,1) ${i * 45}ms,opacity ${ms}ms ease-out ${i * 45}ms;pointer-events:none;`;
    layer.appendChild(ghost);

    requestAnimationFrame(() => {
      const dx = to.x - (r.left + r.width / 2);
      const dy = to.y - (r.top + r.height / 2);
      ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.6) rotate(${i % 2 ? 4 : -4}deg)`;
      ghost.style.opacity = '0.9';
    });
  });

  setTimeout(() => layer.remove(), ms + nodes.length * 45 + 200);
}
