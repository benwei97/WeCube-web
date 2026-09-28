import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { createThumbnail } from "../listingThumbnails.js";

// Public read-only sample. Local HTTP replay isolates image bytes/decode from S3 variability.
const browser = await chromium.launch();
let server;
try {
  const source = await browser.newPage();
  await source.goto(process.env.BENCHMARK_URL || "http://127.0.0.1:5175/");
  await source.waitForSelector(".listing-card-media-image", { timeout: 60000 });
  const urls = await source.locator(".listing-card-media-image").evaluateAll((images) => [...new Set(images.map((image) => image.src))].slice(0, 8));
  if (urls.length < 4) throw new Error("Need at least four real listing images to benchmark.");
  const samples = [];
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Sample image HTTP ${response.status}`);
    const original = Buffer.from(await response.arrayBuffer());
    samples.push({ original, type: response.headers.get("content-type"), thumbnail: await createThumbnail(original) });
  }
  await source.close();
  server = createServer((req, res) => {
    const [, variant, index] = req.url.split("/");
    const sample = samples[Number(index)];
    if (sample && ["original", "thumbnail"].includes(variant)) {
      res.writeHead(200, { "Content-Type": variant === "original" ? sample.type : "image/webp", "Content-Length": sample[variant].length, "Cache-Control": "no-store" });
      res.end(sample[variant]);
    } else { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><body></body>"); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const results = { original: [], thumbnail: [] };
  for (let run = 0; run < 3; run++) {
    for (const variant of run % 2 ? ["thumbnail", "original"] : ["original", "thumbnail"]) {
      const page = await browser.newPage();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 500000, uploadThroughput: 125000 });
      await page.goto(base);
      const ms = await page.evaluate(async ({ base, variant, count }) => {
        const start = performance.now();
        await Promise.all(Array.from({ length: count }, async (_, index) => {
          const image = new Image(); image.width = 240; image.height = 240;
          image.src = `${base}/${variant}/${index}`; document.body.append(image);
          await image.decode();
        }));
        return Math.round(performance.now() - start);
      }, { base, variant, count: samples.length });
      results[variant].push(ms);
      console.error(`${variant} run ${run + 1}: ${ms} ms`);
      await page.close();
    }
  }
  const sum = (variant) => samples.reduce((total, sample) => total + sample[variant].length, 0);
  const median = (values) => [...values].sort((a, b) => a - b)[1];
  console.log(JSON.stringify({ sampleCount: samples.length, network: "4 Mbps / 80 ms latency, cold cache, Chromium local replay", originalBytes: sum("original"), thumbnailBytes: sum("thumbnail"), bytesReductionPercent: +(100 * (1 - sum("thumbnail") / sum("original"))).toFixed(1), timingsMs: results, originalMedianMs: median(results.original), thumbnailMedianMs: median(results.thumbnail), medianSpeedup: +(median(results.original) / median(results.thumbnail)).toFixed(2) }, null, 2));
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await browser.close();
}
