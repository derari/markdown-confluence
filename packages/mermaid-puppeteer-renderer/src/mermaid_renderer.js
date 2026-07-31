import mermaid from "mermaid";
import fmc, { registerIconPacks as registerFmcIconPacks } from "mermaid-fmc";
import bpmn, { registerIconPacks as registerBpmnIconPacks } from "mermaid-bpmn";
import lucideIcons from "@iconify-json/lucide/icons.json";
import noniconsIcons from "@iconify-json/nonicons/icons.json";
import deviconIcons from "@iconify-json/devicon-plain/icons.json";

// Register FMC and BPMN as external diagrams once, before any chart is rendered.
const externalDiagramsRegistered = mermaid.registerExternalDiagrams([fmc, bpmn]);

// Bundle the icon packs at compile time (eager imports, not lazy loaders) so
// they are inlined into the renderer HTML and icon-using diagrams work offline.
// FMC and BPMN each keep their own icon registry, so register the packs with both.
const iconPacks = [
	{ name: "lucide", icons: lucideIcons },
	{ name: "nonicons", icons: noniconsIcons },
	{ name: "devicon", icons: deviconIcons },
];
registerFmcIconPacks(iconPacks);
registerBpmnIconPacks(iconPacks);

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
