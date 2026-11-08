# pit-wall-data

The data pipeline (backend) for Pit Wall. It downloads lap telemetry from
[OpenF1](https://openf1.org), cleans and aligns it, and publishes small JSON
files to GitHub Pages. The 3D website, [pit-wall-web](../pit-wall-web), reads them.

## Commands

```bash
npm install
npm run update                                          # every new qualifying session, this season and last
npm run update -- --years 2025,2026                     # chosen seasons
npm run update -- --force                               # rebuild what is already published
npm run build:session -- --year 2025 --country Belgium  # one session
npm run build:session -- --year 2025 --country Belgium --session "Sprint Qualifying"
npm run build:session -- --key 9935                     # one session by its OpenF1 key (to rebuild it)
npm run serve       # serve out/ at http://localhost:4000 for pit-wall-web
npm test            # geometry, lap-merging and index tests
npm run typecheck
```

A session takes about 47 API calls (7, plus 2 for each driver's lap), spaced
2.1 s apart to stay inside OpenF1's free limit of 30 requests a minute: about
100 seconds. While a live F1 session runs, OpenF1 closes its free tier, past
sessions included; the scripts wait for it to reopen (up to 4 hours).

## Output

```text
out/
├─ LICENSE.txt                        data licence (CC BY-NC-SA 4.0, from OpenF1)
├─ v1/                                the first format, kept for older copies of the site
└─ v2/
   ├─ index.json                      every race weekend and its sessions, newest season first
   ├─ sessions/<session>.json         every driver's fastest lap, without telemetry
   └─ laps/<session>/<driver>.json    one lap's telemetry
```

A session file lists each driver's fastest lap: time, official sector times,
the driver's best sectors, speed trap, tyre compound and age, and which
qualifying segment it was set in. It also carries the full classification, the
session's best sectors and its weather (about one reading a minute). Each lap
file holds parallel arrays sampled about 3.7 times a second: time, distance,
x/y/z position in metres, speed, throttle, brake, gear and RPM. The index gives
each weekend its round number (cancelled races don't count) and a small circuit
outline (an SVG path traced from the pole lap).

A few laps in OpenF1 have broken data: telemetry that stops updating for many
seconds, or positions that don't trace the circuit. Those laps are left out,
with a warning in the log, rather than replayed wrongly
([src/lib/quality.ts](src/lib/quality.ts)). A session that OpenF1 has results
for but no lap data (2025 Azerbaijan, so far) is skipped and tried again on the
next run.

The format is defined in [src/types.ts](src/types.ts), the master copy;
pit-wall-web keeps a copy in `src/lib/data-types.ts`. Breaking changes go under
a new `/vN/` path; new optional fields are not breaking.

## Publishing

Pushing changes under `out/` to `main` runs
[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml), which
publishes `out/` to `https://<your-username>.github.io/pit-wall-data/`.

Every Sunday at 02:30 UTC, after Saturday's qualifying,
[.github/workflows/weekly-data.yml](.github/workflows/weekly-data.yml) runs
`npm run update`, commits any new sessions to `main` and publishes them. You can
also run it from the Actions tab. GitHub pauses scheduled workflows in a public
repository after 60 days without commits, which can happen in the winter
break: if it does, turn it back on from the Actions tab before the season starts.

## Licence

Data derived from OpenF1 is shared under CC BY-NC-SA 4.0 (see
[out/LICENSE.txt](out/LICENSE.txt)): non-commercial use only. Unofficial fan
project, not associated with Formula 1.
