// Builds one session from OpenF1 and adds it to the index.
//
//   npm run build:session -- --year 2025 --country Belgium
//   npm run build:session -- --year 2025 --country Belgium --session "Sprint Qualifying"
//   npm run build:session -- --key 9935
//
// `npm run update` builds every new qualifying session; this is for one-offs
// and rebuilds. See src/lib/build.ts for what gets written.

import { buildSession, writeIndex } from './lib/build';
import { get, type OpenF1Session } from './lib/openf1';

interface Options {
  /** OpenF1 session key, when given directly */
  key: number | null;
  year: number;
  country: string;
  session: string;
  outDir: string;
}

function parseArgs(argv: string[]): Options {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) {
      throw new Error(`Expected --name value pairs, got: ${argv.join(' ')}`);
    }
    args.set(argv[i].slice(2), argv[i + 1]);
  }
  const key = Number(args.get('key')) || null;
  const year = Number(args.get('year'));
  const country = args.get('country');
  if (!key && (!year || !country)) {
    throw new Error(
      'Usage: npm run build:session -- --year 2025 --country Belgium [--session Qualifying], or: npm run build:session -- --key 9935',
    );
  }
  return {
    key,
    year,
    country: country ?? '',
    session: args.get('session') ?? 'Qualifying',
    outDir: args.get('out') ?? 'out',
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let key = opts.key;
  if (key === null) {
    const sessions = await get<OpenF1Session>('sessions', [
      `year=${opts.year}`,
      `country_name=${opts.country}`,
      `session_name=${opts.session}`,
    ]);
    if (sessions.length !== 1) {
      throw new Error(`Expected one ${opts.year} ${opts.country} ${opts.session} session, found ${sessions.length}`);
    }
    key = sessions[0].session_key;
  }
  if (!(await buildSession(key, opts.outDir))) return;
  const index = await writeIndex(opts.outDir);
  console.log(`Wrote session ${key}; the index lists ${index.events.length} race weekends`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
