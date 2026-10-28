<script lang="ts">
  import PossessedCard from "$lib/PossessedCard.svelte";
  import Tombstone from "$lib/Tombstone.svelte";
  import { label, shortUrl, waybackDate, wasPossessed } from "$lib/format";

  let { data } = $props();
  const scan = data.scan;

  const by = (s: string) => (scan ? scan.links.filter((l) => l.verdict.status === s) : []);
  const ghosts = by("ghost");
  // possessed links stay on the wall even after we find them a clean archive copy
  const possessed = scan ? scan.links.filter((l) => l.verdict.status === "possessed" || (l.verdict.status === "reincarnated" && wasPossessed(l))) : [];
  const reborn = by("reincarnated");
  const unsure = by("unsure");
  const alive = by("alive");
  const m = scan?.metrics;
  const p50 = (() => {
    const xs = [...(m?.llmLatencyMs ?? [])].sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : null;
  })();
  const scanned = scan ? new Date(scan.meta.scannedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "";
  const broken = m ? m.counts.ghost + m.counts.possessed + m.counts.reincarnated : 0;
</script>

<svelte:head>
  <title>Bhoot Links report{scan ? `: ${m?.links} links checked` : ""}</title>
  <meta name="description" content="Dead, possessed and reincarnated links in a college syllabus." />
</svelte:head>

<div class="fog" aria-hidden="true"></div>

<header>
  <div class="candles" aria-hidden="true"><span></span><span></span><span></span></div>
  <p class="kicker">a ghost link exorcism</p>
  <h1>Bhoot Links</h1>
  {#if scan}
    <p class="lede">
      Every link in <a href={/^https?:/.test(scan.meta.source) ? scan.meta.source : undefined} rel="noreferrer">{shortUrl(scan.meta.source, 80)}</a>,
      checked on {scanned}. {#if broken > 0}<strong>{broken}</strong> of {m?.links} are dead or possessed{#if m?.counts.reincarnated}, and <strong>{m?.counts.reincarnated}</strong> of those came back from the archive{/if}.{/if}
    </p>
    <div class="badges">
      <span class="badge {scan.meta.mode}">{scan.meta.mode === "mock" ? "demo data (mock run)" : "real run"}</span>
      <span class="badge">ojha: {scan.meta.model ?? "rules only"}</span>
      <span class="badge">browser: {scan.meta.browserProvider}</span>
    </div>
    {#each scan.meta.notes as n}<p class="notice">{n}</p>{/each}
  {/if}
</header>

{#if !scan}
  <main class="empty">
    <p>No <code>results.json</code> found at <code>{data.path}</code>.</p>
    <p>Run <code>npm run demo</code> or <code>npx bhoot scan your-syllabus.pdf</code>, then <code>npx bhoot report</code>.</p>
  </main>
{:else if m}
  <section class="metrics" aria-label="Scan metrics">
    <div class="metric"><b>{m.links}</b><span>links checked</span></div>
    <div class="metric ghost"><b>{m.counts.ghost}</b><span>ghosts</span></div>
    <div class="metric red"><b>{possessed.length}</b><span>possessed{possessed.length > m.counts.possessed ? `, ${possessed.length - m.counts.possessed} resurrected` : ""}</span></div>
    <div class="metric gold"><b>{m.counts.reincarnated}</b><span>reincarnated</span></div>
    <div class="metric green"><b>{m.counts.alive}</b><span>alive</span></div>
    <div class="metric"><b>{m.counts.unsure}</b><span>unsure</span></div>
    <div class="metric small"><b>{m.llmCalls}</b><span>Gemma calls{m.llmRetries ? `, ${m.llmRetries} retried` : ""}</span></div>
    <div class="metric small"><b>{m.tokensIn.toLocaleString("en-IN")}<i>/</i>{m.tokensOut.toLocaleString("en-IN")}</b><span>tokens in / out{scan.meta.mode === "mock" ? " (estimate)" : ""}</span></div>
    <div class="metric small"><b>{p50 !== null ? `${(p50 / 1000).toFixed(1)}s` : "n/a"}</b><span>p50 Gemma latency</span></div>
    <div class="metric small"><b>{m.llmRejectedQuotes}</b><span>made-up quotes caught</span></div>
    <div class="metric small"><b>{m.pagesRendered}</b><span>pages rendered</span></div>
    <div class="metric small"><b>{m.browserMinutes.toFixed(2)}</b><span>browser minutes</span></div>
    <div class="metric small"><b>{m.waybackFound}<i>/</i>{m.waybackLookups}</b><span>Wayback souls found</span></div>
  </section>

  <main>
    {#if possessed.length}
      <section class="possessed">
        <div class="heading">
          <h2>The Possessed</h2>
          <p>These domains lapsed and something else moved in. The page only shows its true face after JavaScript runs, so each one was opened in a real browser and screenshotted.</p>
        </div>
        <div class="wall">
          {#each possessed as link (link.id)}<PossessedCard {link} />{/each}
        </div>
      </section>
    {/if}

    {#if reborn.length}
      <section class="reborn">
        <div class="heading">
          <h2>Resurrections</h2>
          <p>Dead or possessed links whose last clean copy still lives on the Wayback Machine. Swap these into the syllabus.</p>
        </div>
        <ol class="garland">
          {#each reborn as link (link.id)}
            <li>
              {#if link.render?.screenshot}
                <img class="thumb" src={`data/${link.render.screenshot}`} alt={`Takeover at ${link.url}`} loading="lazy" />
              {/if}
              <div class="rb">
                <h3 class:url-title={!link.anchorText}>{label(link)} {#if wasPossessed(link)}<span class="tag red">was possessed</span>{:else}<span class="tag">was dead</span>{/if}</h3>
                <div class="swap">
                  <s>{shortUrl(link.url, 70)}</s>
                  <a href={link.verdict.resurrection_url} rel="noreferrer" target="_blank">🌼 archived copy from {waybackDate(link.wayback?.timestamp)}</a>
                </div>
                <p class="note">“{link.verdict.ojha_note_hinglish}”</p>
              </div>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if ghosts.length}
      <section class="graveyard">
        <div class="heading">
          <h2>The Graveyard</h2>
          <p>Gone for good. No answer from the server, and no clean copy in the archive either.</p>
        </div>
        <div class="stones">
          {#each ghosts as link, i (link.id)}<Tombstone {link} {i} />{/each}
        </div>
        <div class="ground" aria-hidden="true"></div>
      </section>
    {/if}

    {#if unsure.length}
      <section class="unsure">
        <div class="heading">
          <h2>Unsure</h2>
          <p>The ojha would not sign off on these. Either a site refused bots, or the evidence did not match what the model claimed.</p>
        </div>
        <ul class="list">
          {#each unsure as link (link.id)}
            <li>
              <a href={link.url} rel="noreferrer nofollow" target="_blank">{shortUrl(link.url, 80)}</a>
              <span class="why">{link.triage.reasons[0]}</span>
              <em>“{link.verdict.ojha_note_hinglish}”</em>
              {#if link.verdict.rejected?.length}
                <details><summary>claims the validator rejected ({link.verdict.rejected.length})</summary>
                  <ul>{#each link.verdict.rejected as r}<li>{r}</li>{/each}</ul>
                </details>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if alive.length}
      <section class="alive">
        <details>
          <summary><h2>Still breathing <span>({alive.length})</span></h2></summary>
          <ul class="list compact">
            {#each alive as link (link.id)}
              <li><a href={link.url} rel="noreferrer nofollow" target="_blank">{shortUrl(link.url, 90)}</a> <span class="why">{link.probe.status}{link.probe.offDomain ? `, moved to ${link.probe.finalDomain}` : ""}</span></li>
            {/each}
          </ul>
        </details>
      </section>
    {/if}
  </main>
{/if}

<footer>
  <p>Built with <a href="https://github.com/AarishMansur/bhoot-links">bhoot-links</a>: open-weight Gemma as the ojha, Stagehand for the browser, and the Internet Archive for the afterlife.</p>
</footer>

<style>
  .fog {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(40% 18% at 20% 100%, #c9c3ff10, transparent),
      radial-gradient(35% 16% at 80% 100%, #c9c3ff0d, transparent);
    animation: drift 22s ease-in-out infinite alternate;
    z-index: 0;
  }
  @keyframes drift { from { transform: translateX(-3%); } to { transform: translateX(3%); } }

  header, main, .metrics, footer { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; padding: 0 1.4rem; }
  header { text-align: center; padding-top: 3.2rem; }
  .kicker { text-transform: uppercase; letter-spacing: 0.35em; font-size: 0.72rem; color: #b49be0; margin: 1rem 0 0; }
  h1 {
    font-family: "Cinzel", Georgia, serif;
    font-weight: 700;
    font-size: clamp(2.8rem, 8vw, 5.4rem);
    margin: 0.2rem 0 0.6rem;
    letter-spacing: 0.04em;
    background: linear-gradient(180deg, #fff3d6 10%, #ffb84d 60%, #c46a12 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 22px #ff9f1c44);
  }
  .lede { max-width: 640px; margin: 0 auto; color: #cfc8bb; line-height: 1.6; font-size: 1.05rem; }
  .lede strong { color: #ffcf70; }
  .badges { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.1rem; }
  .badge { font-size: 0.72rem; padding: 0.25rem 0.7rem; border-radius: 99px; border: 1px solid #ffffff22; color: #cbc4b6; background: #ffffff08; }
  .badge.mock { border-color: #b49be0; color: #d9ccff; }
  .badge.real { border-color: #6fbf73; color: #bfe8c1; }
  .notice { max-width: 640px; margin: 0.7rem auto 0; font-size: 0.82rem; color: #e9c48a; background: #ffb84d12; border: 1px dashed #ffb84d55; padding: 0.5rem 0.8rem; border-radius: 8px; }

  .candles { display: flex; justify-content: center; gap: 1.4rem; }
  .candles span {
    width: 10px; height: 26px; border-radius: 3px; background: linear-gradient(#f5e6c8, #c9b48a); position: relative;
  }
  .candles span::before {
    content: ""; position: absolute; left: 50%; top: -16px; width: 10px; height: 16px; transform: translateX(-50%);
    background: radial-gradient(circle at 50% 70%, #fff6d0 0 25%, #ffb347 45%, #ff7b0000 70%);
    border-radius: 50% 50% 45% 45%; animation: flicker 1.8s ease-in-out infinite;
    filter: drop-shadow(0 0 8px #ffb347);
  }
  .candles span:nth-child(2) { height: 34px; }
  .candles span:nth-child(2)::before { animation-delay: 0.4s; }
  .candles span:nth-child(3)::before { animation-delay: 0.9s; }
  @keyframes flicker { 0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; } 40% { transform: translateX(-52%) scale(0.92, 1.06); opacity: 0.85; } 70% { transform: translateX(-48%) scale(1.04, 0.95); } }

  .metrics {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 0.6rem; margin-top: 2.2rem;
  }
  .metric { background: #ffffff07; border: 1px solid #ffffff14; border-radius: 12px; padding: 0.8rem 0.9rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .metric b { font-size: 1.7rem; font-family: "Cinzel", Georgia, serif; color: #f3ecdf; }
  .metric b i { font-style: normal; opacity: 0.4; margin: 0 0.15rem; }
  .metric.small b { font-size: 1.2rem; }
  .metric span { font-size: 0.72rem; color: #a79f91; text-transform: lowercase; }
  .metric.ghost b { color: #c7ccd4; }
  .metric.red b { color: #ff5c6c; }
  .metric.gold b { color: #ffbf47; }
  .metric.green b { color: #8fd694; }

  main { padding-bottom: 3rem; }
  section { margin-top: 3.6rem; }
  .heading { max-width: 720px; margin-bottom: 1.4rem; }
  h2 { font-family: "Cinzel", Georgia, serif; font-size: 1.9rem; margin: 0 0 0.3rem; letter-spacing: 0.03em; }
  .heading p { margin: 0; color: #b3ab9d; line-height: 1.55; }

  .possessed h2 { color: #ff6b7a; text-shadow: 0 0 18px #ff1e3c66; }
  .wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.2rem; }

  .reborn h2 { color: #ffbf47; }
  .garland { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.9rem; }
  .garland li {
    display: flex; gap: 1rem; align-items: center; padding: 1rem 1.1rem; border-radius: 14px;
    background: linear-gradient(90deg, #2a1a05, #160f06 70%);
    border: 1px solid #6b4a10;
    position: relative; overflow: hidden;
  }
  .garland li::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 8px;
    background: radial-gradient(circle at 4px 6px, #ffb000 0 3.5px, #ff7b00 3.6px 4px, transparent 4.2px) 0 0 / 8px 12px repeat-y;
  }
  .thumb { width: 132px; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; border-radius: 8px; border: 1px solid #7a1420; filter: grayscale(0.6) sepia(0.3); flex-shrink: 0; }
  .rb { min-width: 0; }
  .rb h3 { margin: 0 0 0.35rem; font-family: "Cinzel", Georgia, serif; font-size: 1.05rem; color: #ffe3b0; }
  .rb h3.url-title { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.9rem; font-weight: 400; }
  .tag { font-family: system-ui, sans-serif; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em; padding: 0.1rem 0.45rem; border-radius: 99px; border: 1px solid #8d8a83; color: #c9c3b8; vertical-align: middle; }
  .tag.red { border-color: #c1121f; color: #ff9aa5; }
  .swap { display: flex; flex-wrap: wrap; gap: 0.3rem 0.9rem; align-items: baseline; font-size: 0.85rem; }
  .swap s { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.74rem; color: #a08b6a; overflow-wrap: anywhere; }
  .swap a { color: #ffcf70; font-weight: 600; text-decoration: none; border-bottom: 1px dashed #ffcf7088; }
  .note { margin: 0.45rem 0 0; font-style: italic; color: #e8d6b2; font-size: 0.88rem; line-height: 1.45; }

  .graveyard h2 { color: #d0d4da; }
  .stones { display: grid; grid-template-columns: repeat(auto-fill, minmax(205px, 1fr)); gap: 2.4rem 1.4rem; padding-top: 1.4rem; }
  .ground { height: 34px; margin-top: -6px; border-radius: 50% 50% 0 0 / 100% 100% 0 0; background: linear-gradient(#1d2a17, #0b0f09); box-shadow: 0 -6px 18px #00000080 inset; }

  .unsure h2 { color: #b49be0; }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; }
  .list li { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 0.7rem 0.9rem; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.88rem; }
  .list a { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.78rem; overflow-wrap: anywhere; }
  .why { color: #9d9587; font-size: 0.78rem; }
  .list em { color: #d6cdbd; }
  details summary { cursor: pointer; color: #a79f91; font-size: 0.78rem; }
  details ul { margin: 0.3rem 0 0; padding-left: 1.1rem; color: #e39aa2; font-size: 0.76rem; }
  .alive summary { list-style: none; }
  .alive summary h2 { display: inline; color: #8fd694; font-size: 1.5rem; }
  .alive summary h2 span { color: #6f8f70; font-size: 1rem; }
  .list.compact li { flex-direction: row; flex-wrap: wrap; gap: 0.6rem; padding: 0.45rem 0.8rem; }

  .empty { text-align: center; padding: 4rem 1rem; color: #b3ab9d; }
  code { font-family: "IBM Plex Mono", ui-monospace, monospace; background: #ffffff10; padding: 0.1rem 0.35rem; border-radius: 4px; }
  footer { text-align: center; color: #7d766a; font-size: 0.8rem; padding: 2rem 1rem 3rem; }
  footer a { color: #b4a68c; }

  @media (prefers-reduced-motion: reduce) {
    .fog, .candles span::before { animation: none; }
  }
  @media (max-width: 560px) {
    .garland li { flex-direction: column; align-items: flex-start; }
    .thumb { width: 100%; }
  }
</style>
