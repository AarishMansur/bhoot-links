<script lang="ts">
  import type { LinkResult } from "../../../src/types";
  import { causeOfDeath, label, shortUrl } from "./format";

  let { link, i = 0 }: { link: LinkResult; i?: number } = $props();
  const shapes = ["round", "arch", "cross", "round"];
  const shape = shapes[i % shapes.length];
</script>

<article class="stone {shape}" style="--tilt:{((i * 37) % 7) - 3}deg">
  <div class="rip">R.I.P.</div>
  <h3 title={link.url} class:url-title={!link.anchorText}>{label(link)}</h3>
  <a class="url" href={link.url} rel="noreferrer nofollow" target="_blank">{shortUrl(link.url, 54)}</a>
  <div class="cause">{causeOfDeath(link)}</div>
  <p class="note">“{link.verdict.ojha_note_hinglish}”</p>
  {#if link.page}<div class="page">syllabus page {link.page}</div>{/if}
</article>

<style>
  .stone {
    position: relative;
    padding: 2.4rem 1.2rem 1.4rem;
    text-align: center;
    color: #d9d6cf;
    background:
      radial-gradient(circle at 30% 20%, #ffffff12, transparent 40%),
      linear-gradient(170deg, #5c5f66 0%, #3f4248 45%, #2b2d31 100%);
    border-radius: 46% 46% 8px 8px / 26% 26% 8px 8px;
    box-shadow:
      inset 0 2px 0 #ffffff1c,
      inset 0 -10px 24px #0007,
      0 16px 30px -12px #000;
    transform: rotate(var(--tilt));
    transition: transform 0.4s ease, box-shadow 0.4s ease;
    min-height: 15.5rem;
  }
  .stone:hover {
    transform: rotate(0deg) translateY(-4px);
    box-shadow: inset 0 2px 0 #ffffff1c, inset 0 -10px 24px #0007, 0 0 34px -6px #9ad0ff55;
  }
  .stone.arch { border-radius: 50% 50% 6px 6px / 40% 40% 6px 6px; }
  .stone.cross::before {
    content: "";
    position: absolute;
    top: -1.6rem;
    left: 50%;
    width: 0.7rem;
    height: 2.2rem;
    transform: translateX(-50%);
    background: #4a4d53;
    border-radius: 2px;
    box-shadow: 0 0.55rem 0 -0 #4a4d53;
  }
  .stone.cross::after {
    content: "";
    position: absolute;
    top: -1.05rem;
    left: 50%;
    width: 2.2rem;
    height: 0.6rem;
    transform: translateX(-50%);
    background: #4a4d53;
    border-radius: 2px;
  }
  .rip {
    font-family: "Cinzel", Georgia, serif;
    letter-spacing: 0.3em;
    font-size: 0.8rem;
    color: #a9a59c;
    text-shadow: 0 1px 0 #0009, 0 -1px 0 #fff2;
  }
  h3 {
    font-family: "Cinzel", Georgia, serif;
    font-size: 1.02rem;
    margin: 0.5rem 0 0.4rem;
    color: #ece8df;
    text-shadow: 0 1px 0 #000a, 0 -1px 0 #fff1;
    overflow-wrap: anywhere;
  }
  h3.url-title { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.82rem; font-weight: 400; }
  .url {
    display: block;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.7rem;
    color: #b8c4cc;
    text-decoration: none;
    overflow-wrap: anywhere;
    opacity: 0.8;
  }
  .url:hover { color: #fff; }
  .cause {
    margin: 0.8rem auto 0.6rem;
    display: inline-block;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: 0.2rem 0.6rem;
    border-top: 1px solid #ffffff22;
    border-bottom: 1px solid #ffffff22;
    color: #e0b16a;
  }
  .note { font-style: italic; font-size: 0.85rem; line-height: 1.45; color: #cfcac0; margin: 0.4rem 0 0; }
  .page { margin-top: 0.6rem; font-size: 0.68rem; color: #8d8a83; }
</style>
