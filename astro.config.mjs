import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: "https://www.fuehrungsmandat.de",
  integrations: [
    tailwind({
      applyBaseStyles: false
    })
  ]
});
