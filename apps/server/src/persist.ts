import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomPersist } from './rooms';

/** 服务端落盘：`<PARK_DATA_DIR>/rooms/<房号>.json`，临时文件 + rename 原子替换 */
export function filePersist(): RoomPersist {
  const dir = () => join(process.env.PARK_DATA_DIR || join(process.cwd(), 'data'), 'rooms');
  return {
    list() {
      try {
        return readdirSync(dir())
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -'.json'.length));
      } catch {
        return [];
      }
    },
    read(code) {
      try {
        return JSON.parse(readFileSync(join(dir(), `${code}.json`), 'utf8')) as unknown;
      } catch {
        return null;
      }
    },
    write(code, data) {
      const d = dir();
      mkdirSync(d, { recursive: true });
      const file = join(d, `${code}.json`);
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, file);
    },
    remove(code) {
      try {
        unlinkSync(join(dir(), `${code}.json`));
      } catch {
        /* 已经没了 */
      }
    },
  };
}
