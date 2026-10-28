# Real run: VTU B.E. CSE syllabus, 2022 scheme, 3rd and 4th semester

| | |
| --- | --- |
| Source | <https://vtu.ac.in/pdf/2022_3to8/2cssyll.pdf> (Visvesvaraya Technological University, 88 page PDF, listed on [vtu.ac.in/en/b-e-scheme-syllabus](https://vtu.ac.in/en/b-e-scheme-syllabus/)) |
| Scanned | 29 Oct 2026, 01:48 IST (`2026-10-28T20:18:30Z` in `results.json`) |
| Command | `DNS_RESOLVER=doh HTTP_UPGRADE=1 BROWSER_PROVIDER=local npx bhoot scan https://vtu.ac.in/pdf/2022_3to8/2cssyll.pdf` |
| Ojha | deterministic rules, **not Gemma** (no API key on the build machine) |
| Browser | Stagehand driving **local Chrome**, not Browserbase (no API key on the build machine) |

![Report built from this run](report.png)

Full page: [report-full.png](report-full.png). Raw data: [results.json](results.json), with the untouched tool output in [results.raw.json](results.raw.json) and the console log in [scan.log](scan.log).

## Counts

| | Links |
| --- | --- |
| Unique links extracted | **106** |
| Alive | **80** |
| Dead or possessed (confirmed) | **11** |
|   of which dead | 10 |
|   of which possessed (domain now parked "for sale") | 1 |
|   of which a clean Wayback copy was found (reincarnated) | 8 |
|   no clean copy anywhere (ghost) | 3 |
| Unsure | **15** |
|   could not be verified from the build machine's network (see below) | 4 |
|   refused a bot (HTTP 403 or robots.txt disallow) | 6 |
|   JS-only course pages behind a login on infyspringboard.onwingspan.com | 5 |

Other numbers from the same run:

* 54 of the 106 links are YouTube videos. 53 still play, 1 was removed (oEmbed 404).
* All 5 `nptel.ac.in` links in this syllabus return 404. Wayback had a clean capture for all 5.
* 23 links still use plain `http://`.
* Wayback lookups: 21, clean capture found for 17 (some of those were for links that ended up unsure, so they are not offered as replacements).
* Pages rendered in a real browser: 8, using 0.77 browser minutes in one session. Whole scan: 219 s.

## The confirmed findings

| Verdict | Page | Link | Why | Clean copy |
| --- | --- | --- | --- | --- |
| reincarnated, was **possessed** | 16 | `http://www.nptelvideos.in/2012/11/data-structures-and-algorithms.html` | domain now shows "nptelvideos.in may be for sale, click to inquire" ([screenshot](shots/dfb2cc813b.jpg)) | [26 Feb 2021](https://web.archive.org/web/20210226215827/http://www.nptelvideos.in/2012/11/data-structures-and-algorithms.html) |
| reincarnated | 4 | `http://nptel.ac.in/courses.php?disciplineID=111` | HTTP 404 | [8 Mar 2016](https://web.archive.org/web/20160308062610/http://nptel.ac.in/courses.php?disciplineid=111) |
| reincarnated | 16 | `https://nptel.ac.in/courses/106/105/106105171/` | HTTP 404 | [23 Jul 2021](https://web.archive.org/web/20210723183542/https://nptel.ac.in/courses/106/105/106105171/) |
| reincarnated | 16 | `https://nptel.ac.in/courses/106/102/106102064/` | HTTP 404 | [16 May 2021](https://web.archive.org/web/20210516180654/https://nptel.ac.in/courses/106/102/106102064/) |
| reincarnated | 27 | `https://www.edx.org/course/introduction-to-c-3` | HTTP 404 | [6 Jun 2023](https://web.archive.org/web/20230606154853/https://www.edx.org/course/introduction-to-c-3) |
| reincarnated | 53 | `https://nptel.ac.in/courses/106/101/106101060/` | HTTP 404 | [11 Apr 2021](https://web.archive.org/web/20210411040319/https://nptel.ac.in/courses/106/101/106101060/) |
| reincarnated | 67 | `http://www.abstractmath.org/` | HTTP 522 (Cloudflare cannot reach the origin) | [18 Jul 2026](https://web.archive.org/web/20260718223322/https://abstractmath.org/) |
| reincarnated | 74 | `https://nptel.ac.in/syllabus/111106051/` | HTTP 404 | [9 Dec 2017](https://web.archive.org/web/20171209074943/http://nptel.ac.in:80/syllabus/111106051/) |
| ghost | 4 | `http://www.class-central.com/subject/math` | 301, 301, then 404 at classcentral.com | none |
| ghost | 4 | `http://www.bookstreet.in/` | domain no longer resolves (NXDOMAIN over DoH) | none clean |
| ghost | 82 | `https://www.youtube.com/watch?v=w0cD26CLBA0` | YouTube oEmbed 404, video removed | not useful for video |

The nptelvideos.in case is the one this tool exists for: a plain HTTP check says **200 OK**. The static HTML is 143 characters plus a script; only the rendered page shows the "for sale" banner. The newest Wayback captures (July 2026) are the parked page too, so the archive search steps back in time until it finds the 2021 copy that still has Dr. Naveen Garg's IIT Delhi lecture list.

## Unverified from the build machine (moved to unsure)

The box this run was made on sits behind an egress proxy that answers every plain `http://` request with `500, Server: Pingora`, and fakes DNS answers. `HTTP_UPGRADE=1` and `DNS_RESOLVER=doh` work around most of that, but these four links could not be checked fairly from there, so [`mark-unverified.ts`](mark-unverified.ts) moved them to unsure before publishing. They need a recheck from a normal connection:

* `http://elearning.vtu.ac.in/econtent/courses/video/CSE/06CS35.html` (http only, proxy 500)
* `http://cse01-iiith.vlabs.ac.in/` (http only, proxy 500)
* `https://www.javatpoint.com/java-tutorial` and `https://www.javatpoint.com/latex` (connection reset, from this network only as far as I can tell)

## What still needs keys

This run did **not** use Gemma or Browserbase. With `GOOGLE_GENERATIVE_AI_API_KEY`, `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` in `.env`, the same command will:

* render suspicious pages in a Browserbase session (replay link printed) and run Stagehand `extract()` on them,
* have Gemma write each verdict and ojha note, checked by the quote validator,
* fill the token, latency and retry numbers in the metrics strip.

Until then, every verdict in this folder is `by: "rules"`.
