import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** dist/cli.js, the file the `ukdata` bin entry point points at. */
const BUILT_CLI_PATH = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

describe('built ukdata bin', () => {
  it('loads under plain node and lists the UK sources', () => {
    expect(existsSync(BUILT_CLI_PATH), 'run `npm run build` before this test').toBe(true);
    const stdout = execFileSync(process.execPath, [BUILT_CLI_PATH, 'sources'], {
      encoding: 'utf8',
    });
    const sources = JSON.parse(stdout) as Array<{ id: string }>;
    expect(sources.map((source) => source.id)).toEqual([
      'flood-stations',
      'flood-readings',
      'ons-datasets',
    ]);
  });
});
