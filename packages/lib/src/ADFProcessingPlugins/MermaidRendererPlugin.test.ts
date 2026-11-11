import { describe, expect, test } from "vitest";
import type { JSONDocNode } from "@atlaskit/editor-json-transformer";
import {
	getMermaidFileName,
	MermaidRenderer,
	MermaidRendererPlugin,
} from "./MermaidRendererPlugin";
import type { UploadedImageData } from "../Attachments";

const chart = "flowchart TB\n  a --> b";

function docWithChart(): JSONDocNode {
	return {
		type: "doc",
		version: 1,
		content: [
			{
				type: "codeBlock",
				attrs: { language: "mermaid" },
				content: [{ type: "text", text: chart }],
			},
		],
	} as JSONDocNode;
}

function imageMap(): Record<string, UploadedImageData | null> {
	return {
		[getMermaidFileName(chart).uploadFilename]: {
			filename: "chart.png",
			id: "file-id",
			collection: "contentId-1",
			width: 1172,
			height: 3838,
			status: "existing",
		},
	};
}

function renderer(pixelRatio?: number): MermaidRenderer {
	return {
		captureMermaidCharts: async () => new Map(),
		...(pixelRatio === undefined ? {} : { pixelRatio }),
	};
}

function mediaSingle(pixelRatio?: number) {
	const adf = new MermaidRendererPlugin(renderer(pixelRatio)).load(docWithChart(), imageMap());
	return adf.content[0]!;
}

describe("MermaidRendererPlugin display size", () => {
	test("a high-density chart is shown at pixel size / pixelRatio", () => {
		const node = mediaSingle(2);
		expect(node.type).toBe("mediaSingle");
		expect(node.attrs).toEqual({ layout: "center", width: 586, widthType: "pixel" });
		// The media node keeps the real image dimensions.
		expect(node.content?.[0]?.attrs).toMatchObject({ width: 1172, height: 3838 });
	});

	test("without a pixelRatio the chart keeps Confluence's default sizing", () => {
		expect(mediaSingle().attrs).toEqual({ layout: "center" });
	});
});
