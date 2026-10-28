<script lang="ts">
  import "@fontsource/cinzel/500.css";
  import "@fontsource/cinzel/700.css";
  import "@fontsource/ibm-plex-mono/400.css";

  let { children } = $props();
</script>

{@render children()}

<style>
  :global(html) { background: #07060b; }
  :global(body) {
    margin: 0;
    color: #e6e1d7;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
    background:
      radial-gradient(1200px 600px at 50% -10%, #2b1d47 0%, transparent 60%),
      radial-gradient(900px 500px at 100% 30%, #3b0d1633 0%, transparent 70%),
      radial-gradient(700px 500px at 0% 70%, #3a2a0a22 0%, transparent 70%),
      #07060b;
    min-height: 100vh;
  }
  :global(a) { color: #ffcf70; }
  :global(*) { box-sizing: border-box; }
</style>
