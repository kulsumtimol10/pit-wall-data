// Brings the published data up to date: builds every finished qualifying
// session that is not published yet, newest first, rewriting the index after
// each one, and once more at the end.
//
//   npm run update                          this season and last
//   npm run update -- --years 2025,2026     chosen seasons
//   npm run update -- --force               rebuild sessions already published
//
// The weekly GitHub workflow runs this, then commits and publishes out/.
// Each session takes about 47 API calls, so about 100 seconds.

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSession, versionDir, writeIndex } from './lib/build';
import { get, type OpenF1Session } from './lib/openf1';

const SESSION_NAME = 'Qualifying';
/** OpenF1 can still be filling in a session just after it ends. */
const SETTLE_MS = 60 * 60_000;

function parseArgs(argv: string[]) {
  const yearsAt = argv.indexOf('--years');
  // Last season too, so a run in January still catches December's sessions.
  const thisYear = new Date().getUTCFullYear();
  const years = yearsAt >= 0 ? argv[yearsAt + 1]?.split(',').map(Number) : [thisYear - 1, thisYear];
  if (!years?.length || years.some((y) => !Number.isInteger(y))) {
    throw new Error('Usage: npm run update -- [--years 2025,2026] [--force]');
  }
  return { years, force: argv.includes('--force'), outDir: 'out' };
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function main() {
  const { years, force, outDir } = parseArgs(process.argv.slice(2));
  let built = 0;
  const failed: string[] = [];

  for (const year of [...years].sort((a, b) => b - a)) {
    const sessions = (await get<OpenF1Session>('sessions', [`year=${year}`, `session_name=${SESSION_NAME}`]))
      .filter((s) => Date.parse(s.date_end) + SETTLE_MS < Date.now())
      .sort((a, b) => b.date_start.localeCompare(a.date_start));
    const todo = [];
    for (const s of sessions) {
      if (force || !(await exists(join(versionDir(outDir), 'sessions', `${s.session_key}.json`)))) todo.push(s);
    }
    console.log(`${year}: ${sessions.length} finished ${SESSION_NAME} sessions, ${todo.length} to build`);

    for (const s of todo) {
      try {
        if (!(await buildSession(s.session_key, outDir))) continue;
        await writeIndex(outDir);
        built++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ! session ${s.session_key} failed: ${message}`);
        failed.push(`${year} ${s.country_name} (session ${s.session_key}): ${message}`);
      }
    }
  }

  // Round numbers can change without a new session (a race cancelled later in
  // the season); the index file only changes when its contents do.
  await writeIndex(outDir);
  console.log(built ? `Built ${built} sessions` : 'Nothing new to build');
  if (failed.length) {
    console.error(`${failed.length} sessions failed:\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
