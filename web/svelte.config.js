import adapter from "@sveltejs/adapter-static";

/** Static report: the whole graveyard is prerendered into plain HTML at build time. */
export default {
  kit: {
    adapter: adapter({ pages: "build", assets: "build", strict: true }),
    paths: { relative: true },
    output: { bundleStrategy: "inline" },
  },
};
