import { ChartData, MermaidRenderer } from "@markdown-confluence/lib";
import puppeteer, { LaunchOptions } from "puppeteer";
import { downloadBrowsers } from "puppeteer/lib/puppeteer/node/install.js";

interface RemoteWindowedCustomFunctions {
	renderMermaidChart: (
		mermaidData: string,
		mermaidConfig: unknown,
	) => Promise<{ width: number; height: number }>;
}

// Charts are captured at this pixel density by default and shown in Confluence
// at 1/DEFAULT_SCALE of their pixel size, i.e. at their natural size.
const DEFAULT_SCALE = 2;

// "%% zoom 3" (or "%% zoom: 1.5") inside a chart overrides the capture scale.
// Since display size is pixel size / DEFAULT_SCALE, a zoom above the default
// also shows the chart larger.
const zoomRegex = /^\s*%%\s*zoom\s*:?\s*(\d+(?:\.\d+)?)\s*$/m;

export function chartScale(chartData: string): number {
	const zoom = Number(chartData.match(zoomRegex)?.[1]);
	return zoom > 0 ? zoom : DEFAULT_SCALE;
}

export class PuppeteerMermaidRenderer implements MermaidRenderer {
	readonly pixelRatio = DEFAULT_SCALE;

	async captureMermaidCharts(charts: ChartData[]): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();

		await downloadBrowsers();
		//for (const chart of charts) {
		const promises = charts.map(async (chart) => {
			const executablePath = await puppeteer.executablePath();
			const puppeteerLaunchConfig = {
				executablePath,
				headless: true,
				args: [
					"--ignore-certificate-errors",
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-accelerated-2d-canvas",
					"--disable-gpu",
				],
			} satisfies LaunchOptions;

			console.log("LAUNCHING CHROME", JSON.stringify(puppeteerLaunchConfig));
			const browser = await puppeteer.launch(puppeteerLaunchConfig);

			const page = await browser.newPage();
			try {
				const pathToLoad = new URL(
					/* @vite-ignore */
					"mermaid_renderer.html",
					import.meta.url,
				).href;

				await page.goto(pathToLoad);

				const mermaidConfig = {
					theme: "base",
					// Some shapes are drawn with rough.js; seed 0 (the default) is
					// random, so every render differs slightly and the image is
					// re-uploaded each sync.
					handDrawnSeed: 1,
					themeVariables: {
						background: "#ffffff",
						mainBkg: "#ddebff",
						primaryColor: "#ddebff",
						primaryTextColor: "#222222", // "#192b50",
						primaryBorderColor: "#0052cc",
						secondaryColor: "#75C1FF", // "#ff8f73",
						secondaryTextColor: "#192b50",
						secondaryBorderColor: "#0B71BF", // "#df360c",
						tertiaryColor: "#c0b6f3",
						tertiaryTextColor: "#fefefe",
						tertiaryBorderColor: "#5243aa",
						noteBkgColor: "#ffc403",
						noteTextColor: "#182a4e",
						textColor: "#222222", // "#192b50",
						titleColor: "#0052cc",
					},
				};

				const result = await page.evaluate(
					(mermaidData, mermaidConfig) => {
						const { renderMermaidChart } =
							globalThis as unknown as RemoteWindowedCustomFunctions;

						return renderMermaidChart(mermaidData, mermaidConfig);
					},
					chart.data,
					mermaidConfig,
				);

				// Scale via pixel density, which works for every diagram type.
				// Enlarging the viewport only works for SVGs that grow with it.
				await page.setViewport({
					width: result.width,
					height: result.height,
					deviceScaleFactor: chartScale(chart.data),
				});
				const imageBuffer = Buffer.from(await page.screenshot());
				capturedCharts.set(chart.name, imageBuffer);
			} finally {
				await page.close();
				await browser.close();
			}
		});

		await Promise.all(promises);

		return capturedCharts;
	}
}
