import { describe, expect, test } from "vitest";
import { adfEqual } from "./AdfEqual";
import type { ADFEntity } from "@atlaskit/adf-utils/types";

const BASE = "https://example.atlassian.net/wiki/spaces/VT/pages/16154637";

function docWithLink(href: string): ADFEntity {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{ type: "text", text: "link", marks: [{ type: "link", attrs: { href } }] },
				],
			},
		],
	};
}

function docWithInlineCard(url: string): ADFEntity {
	return { type: "doc", content: [{ type: "inlineCard", attrs: { url } }] };
}

function docWithTable(attrs?: Record<string, unknown>): ADFEntity {
	return {
		type: "doc",
		content: [{ type: "table", ...(attrs ? { attrs } : {}), content: [] }],
	};
}

describe("adfEqual ignores Confluence server-side canonicalisation", () => {
	test("page links are equal with or without the trailing title slug", () => {
		expect(adfEqual(docWithLink(`${BASE}/Provisioned+table`), docWithLink(BASE))).toBe(true);
	});

	test("inline cards are equal with or without the trailing title slug", () => {
		expect(
			adfEqual(docWithInlineCard(`${BASE}/Provisioned+table`), docWithInlineCard(BASE)),
		).toBe(true);
	});

	test("a table with no layout equals one with the default layout", () => {
		expect(adfEqual(docWithTable(), docWithTable({ layout: "default" }))).toBe(true);
	});

	test("a server-assigned attrs.localId is ignored", () => {
		const generated: ADFEntity = { type: "doc", content: [{ type: "expand", attrs: {} }] };
		const fromServer: ADFEntity = {
			type: "doc",
			content: [{ type: "expand", attrs: { localId: "e5a1f0c2-1234" } }],
		};
		expect(adfEqual(generated, fromServer)).toBe(true);
	});

	test("server-inserted mediaSingle width/widthType are ignored", () => {
		const media = (attrs: Record<string, unknown>): ADFEntity => ({
			type: "doc",
			content: [{ type: "mediaSingle", attrs, content: [] }],
		});
		const generated = media({ layout: "center" });
		const fromServer = media({ layout: "center", width: 76.5, widthType: "percentage" });
		expect(adfEqual(generated, fromServer)).toBe(true);
	});

	test("server-inserted macroId and schemaVersion in macroMetadata are ignored", () => {
		const macro = (metadata: Record<string, unknown>): ADFEntity => ({
			type: "doc",
			content: [
				{
					type: "extension",
					attrs: {
						extensionKey: "toc",
						parameters: { macroMetadata: metadata },
					},
				},
			],
		});
		const generated = macro({ title: "Table of Contents" });
		const fromServer = macro({
			title: "Table of Contents",
			macroId: { value: "b1f7c0de-0000-4a2b-9c3d-abcdef012345" },
			schemaVersion: { value: "1" },
		});
		expect(adfEqual(generated, fromServer)).toBe(true);
	});
});

describe("adfEqual still detects real differences", () => {
	test("links to different pages are not equal", () => {
		const other = "https://example.atlassian.net/wiki/spaces/VT/pages/99999999";
		expect(adfEqual(docWithLink(BASE), docWithLink(other))).toBe(false);
	});

	test("non-Confluence links keep their full path", () => {
		expect(
			adfEqual(docWithLink("https://example.com/a/b"), docWithLink("https://example.com/a")),
		).toBe(false);
	});

	test("a non-default table layout is not flattened to default", () => {
		expect(
			adfEqual(docWithTable({ layout: "full-width" }), docWithTable({ layout: "default" })),
		).toBe(false);
	});

	test("adfEqual does not mutate its inputs", () => {
		const generated = docWithLink(`${BASE}/Provisioned+table`);
		const before = JSON.stringify(generated);
		adfEqual(generated, docWithLink(BASE));
		expect(JSON.stringify(generated)).toBe(before);
	});
});
