import { describe, expect, it } from 'vitest';
import { normalizeServer } from '../src/lib/platform';

describe('联机服务器地址规范化', () => {
  it('只写主机和端口时补上 ws:// 与 /ws', () => {
    expect(normalizeServer('192.168.1.9:8787')).toBe('ws://192.168.1.9:8787/ws');
    expect(normalizeServer('10.0.2.2:8787')).toBe('ws://10.0.2.2:8787/ws');
    expect(normalizeServer('localhost')).toBe('ws://localhost/ws');
  });

  it('http/s 自动换成 ws/wss', () => {
    expect(normalizeServer('http://192.168.1.9:8787')).toBe('ws://192.168.1.9:8787/ws');
    expect(normalizeServer('https://game.example.com')).toBe('wss://game.example.com/ws');
  });

  it('已经写好路径就尊重玩家', () => {
    expect(normalizeServer('wss://game.example.com/ws')).toBe('wss://game.example.com/ws');
    expect(normalizeServer('ws://192.168.1.9:8787/custom')).toBe(
      'ws://192.168.1.9:8787/custom',
    );
  });

  it('去掉行尾多余斜杠与空白；空输入表示"用同源"', () => {
    expect(normalizeServer('  ws://1.2.3.4:8787/  ')).toBe('ws://1.2.3.4:8787/ws');
    expect(normalizeServer('   ')).toBe('');
  });
});
