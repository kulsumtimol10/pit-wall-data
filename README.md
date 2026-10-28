# pit-wall-data

The data pipeline (backend) for Pit Wall. It downloads lap telemetry from
[OpenF1](https://openf1.org), cleans and aligns it, and publishes small JSON
files to GitHub Pages. The 3D website, [pit-wall-web](../pit-wall-web), reads them.

## Commands

```bash
npm install
npm run build:session -- --year 2025 --country Belgium   # top 2 qualifying laps
npm run build:session -- --year 2025 --country Belgium --top 5
npm run serve       # serve out/ at http://localhost:4000 for pit-wall-web
npm test            # geometry and lap-merging tests
npm run typecheck
```

`build:session` makes about `7 + 2 × top` API calls, spaced 2.1 s apart to
stay inside OpenF1's free limit of 30 requests a minute.

## Output

```text
out/
├─ LICENSE.txt              data licence (CC BY-NC-SA 4.0, from OpenF1)
└─ v1/
   ├─ index.json            every published session, newest first
   └─ laps/<session>.json   one file per session: each driver's fastest lap
```

Each lap holds parallel arrays sampled about 3.7 times a second: time, distance,
x/y/z position in metres, speed, throttle, brake, gear and RPM, plus the lap's
official sector times, the driver's best sectors, speed trap, tyre compound and
age, and which qualifying segment it was set in. Each session file also carries
the full classification, the session's best sectors and its weather (about one
reading a minute). The format is defined in [src/types.ts](src/types.ts), the
master copy; pit-wall-web keeps a copy in `src/lib/data-types.ts`. Breaking
changes go under a new `/v2/` path; new optional fields are not breaking.

## Publishing

Pushing changes under `out/` to `main` runs
[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml), which
publishes `out/` to `https://<your-username>.github.io/pit-wall-data/`.

## Licence

Data derived from OpenF1 is shared under CC BY-NC-SA 4.0 (see
[out/LICENSE.txt](out/LICENSE.txt)): non-commercial use only. Unofficial fan
project, not associated with Formula 1.
