import mermaid from "mermaid";
import fmc, { registerIconPacks } from "mermaid-fmc";
import lucideIcons from "@iconify-json/lucide/icons.json";
import noniconsIcons from "@iconify-json/nonicons/icons.json";
import deviconIcons from "@iconify-json/devicon-plain/icons.json";

// Register FMC as an external diagram once, before any chart is rendered.
const externalDiagramsRegistered = mermaid.registerExternalDiagrams([fmc]);

// Bundle the icon packs at compile time (eager imports, not lazy loaders) so
// they are inlined into the renderer HTML and icon-using diagrams work offline.
registerIconPacks([
	{ name: "lucide", icons: lucideIcons },
	{ name: "nonicons", icons: noniconsIcons },
	{ name: "devicon", icons: deviconIcons },
]);

window.renderMermaidChart = async (chartData, mermaidConfig) => {
	await externalDiagramsRegistered;

	mermaid.initialize({ ...mermaidConfig, startOnLoad: false });

	const { svg } = await mermaid.render("graphDiv2", chartData);
	const chartElement = document.querySelector("#graphDiv");
	chartElement.innerHTML = svg;

	const svgElement = document.querySelector("#graphDiv svg");
	return {
		width: svgElement.scrollWidth,
		height: svgElement.scrollHeight,
	};
};
