<script lang="ts">
  import type { LinkResult } from "../../../src/types";
  import { label, shortUrl } from "./format";

  let { link }: { link: LinkResult } = $props();
  const shot = link.render?.screenshot ? `data/${link.render.screenshot}` : null;
  const final = link.render?.finalUrl ?? link.probe.finalUrl;
  const moved = final && final.replace(/\/$/, "") !== link.url.replace(/\/$/, "");
  const flags = [
    link.render?.casino && "casino",
    link.render?.gambling && "betting",
    link.render?.parked && "parked / for sale",
  ].filter(Boolean) as string[];
</script>

<article class="card">
  <div class="frame">
    {#if shot}
      <img src={shot} alt={`What students now see at ${link.url}`} loading="lazy" />
    {:else}
      <div class="noshot">no screenshot</div>
    {/if}
    <div class="stamp">possessed</div>
  </div>
  <div class="body">
    <h3>{label(link)}</h3>
    <div class="urls">
      <span class="was">{shortUrl(link.url, 58)}</span>
      {#if moved}<span class="arrow">↳ now sends you to</span><span class="now">{shortUrl(final, 58)}</span>{/if}
    </div>
    {#if flags.length}
      <div class="flags">{#each flags as f}<span>{f}</span>{/each}</div>
    {/if}
    {#each link.verdict.evidence.slice(0, 2) as ev}
      <blockquote><span class="src">{ev.source}</span> {ev.quote}</blockquote>
    {/each}
    <p class="note">“{link.verdict.ojha_note_hinglish}”</p>
  </div>
</article>

<style>
  .card {
    background: linear-gradient(180deg, #2a0a0f, #16070a);
    border: 1px solid #7a1420;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 0 0 1px #00000080, 0 20px 40px -18px #ff1e3c55;
    transition: transform 0.35s ease, box-shadow 0.35s ease;
  }
  .card:hover { transform: translateY(-4px); box-shadow: 0 0 0 1px #00000080, 0 26px 50px -16px #ff1e3c88; }
  .frame { position: relative; aspect-ratio: 16 / 10; background: #000; overflow: hidden; }
  img { width: 100%; height: 100%; object-fit: cover; object-position: top; filter: saturate(0.75) contrast(1.05); transition: filter 0.5s; }
  .card:hover img { filter: saturate(1) contrast(1); }
  .frame::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 50%, #16070a 100%), repeating-linear-gradient(0deg, #ff00000a 0 2px, transparent 2px 4px);
    pointer-events: none;
  }
  .noshot { display: grid; place-items: center; height: 100%; color: #7a5a5e; font-size: 0.85rem; }
  .stamp {
    position: absolute;
    top: 0.9rem;
    right: -2.4rem;
    transform: rotate(32deg);
    background: #c1121f;
    color: #fff3f3;
    font-family: "Cinzel", Georgia, serif;
    font-weight: 600;
    letter-spacing: 0.2em;
    font-size: 0.7rem;
    padding: 0.3rem 3rem;
    z-index: 2;
    box-shadow: 0 4px 14px #000a;
  }
  .body { padding: 1rem 1.1rem 1.2rem; }
  h3 { margin: 0 0 0.4rem; font-family: "Cinzel", Georgia, serif; font-size: 1.05rem; color: #ffd9dc; overflow-wrap: anywhere; }
  .urls { display: flex; flex-direction: column; gap: 0.15rem; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.72rem; overflow-wrap: anywhere; }
  .was { color: #f0b5bb; }
  .arrow { color: #8f5960; font-family: system-ui, sans-serif; font-size: 0.7rem; }
  .now { color: #ff6b7a; }
  .flags { display: flex; gap: 0.35rem; flex-wrap: wrap; margin: 0.7rem 0 0.3rem; }
  .flags span { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; background: #c1121f33; border: 1px solid #c1121f; color: #ffb3ba; padding: 0.1rem 0.45rem; border-radius: 99px; }
  blockquote { margin: 0.55rem 0 0; padding: 0.35rem 0.6rem; border-left: 2px solid #c1121f; background: #00000040; font-size: 0.8rem; color: #f3d6d8; overflow-wrap: anywhere; }
  .src { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.12em; color: #a6656c; margin-right: 0.3rem; }
  .note { margin: 0.7rem 0 0; font-style: italic; font-size: 0.86rem; color: #f6c9cd; line-height: 1.45; }
</style>
