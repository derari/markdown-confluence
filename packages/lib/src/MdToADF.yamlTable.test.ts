import { describe, expect, test } from "vitest";
import { convertMDtoADF } from "./MdToADF";
import type { ConfluenceSettings } from "./Settings";
import type { MarkdownFile } from "./MarkdownWorkspace";

const settings = {
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "1",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	folderToPublish: ".",
	contentRoot: "./",
	firstHeadingPageTitle: false,
} as unknown as ConfluenceSettings;

function toAdf(contents: string) {
	const file = {
		folderName: "f",
		absoluteFilePath: "/f/page.md",
		fileName: "page.md",
		contents,
		pageTitle: "Page",
		frontmatter: {},
	} as unknown as MarkdownFile;
	// convertMDtoADF mutates file.contents, so pass a fresh object each call.
	return convertMDtoADF(file, settings).contents as unknown as AdfNode;
}

interface AdfNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: { type: string; attrs?: Record<string, unknown> }[];
	content?: AdfNode[];
}

function fence(language: string, body: string): string {
	return "```" + language + "\n" + body + "\n```";
}

function firstTable(doc: AdfNode): AdfNode | undefined {
	return (doc.content ?? []).find((node) => node.type === "table");
}

/** Text of a table cell: cell -> paragraph -> text. */
function cellText(cell: AdfNode): string {
	return cell.content?.[0]?.content?.[0]?.text ?? "";
}

/** Every text node anywhere in the tree. */
function allText(node: AdfNode): string[] {
	const here = node.text !== undefined ? [node.text] : [];
	const nested = (node.content ?? []).flatMap(allText);
	return [...here, ...nested];
}

/** Every header/cell node in a table. */
function allCells(table: AdfNode): AdfNode[] {
	return (table.content ?? []).flatMap((row) => row.content ?? []);
}

describe("yaml-table code block", () => {
	test("renders a table from an array of uniform objects", () => {
		const doc = toAdf(
			fence("yaml-table", "- name: Alice\n  role: Admin\n- name: Bob\n  role: User"),
		);
		const table = firstTable(doc);
		expect(table).toBeDefined();

		const rows = table!.content ?? [];
		// header row + one row per entry
		expect(rows).toHaveLength(3);

		const header = (rows[0]!.content ?? []).map(cellText);
		expect(header).toEqual(["name", "role"]);
		expect((rows[1]!.content ?? []).map(cellText)).toEqual(["Alice", "Admin"]);
		expect((rows[2]!.content ?? []).map(cellText)).toEqual(["Bob", "User"]);
	});

	test("renders a table from a single object", () => {
		const doc = toAdf(fence("yaml-table", "name: Alice\nrole: Admin"));
		const table = firstTable(doc);
		expect(table).toBeDefined();

		const rows = table!.content ?? [];
		expect(rows).toHaveLength(2);
		expect((rows[0]!.content ?? []).map(cellText)).toEqual(["name", "role"]);
		expect((rows[1]!.content ?? []).map(cellText)).toEqual(["Alice", "Admin"]);
	});

	test("also accepts the 'yaml table' language spelling", () => {
		const doc = toAdf(fence("yaml table", "- name: Alice\n  role: Admin"));
		expect(firstTable(doc)).toBeDefined();
	});

	test("merges a back-filled ragged column into a colspan (no leaked markers)", () => {
		// Bob introduces a new "extra" column, so Alice's missing cell is
		// back-filled with a "<" marker that mergeCells folds into a colspan.
		const doc = toAdf(
			fence(
				"yaml-table",
				"- name: Alice\n  role: Admin\n- name: Bob\n  role: User\n  extra: X",
			),
		);
		const table = firstTable(doc)!;
		const rows = table.content ?? [];

		expect((rows[0]!.content ?? []).map(cellText)).toEqual(["name", "role", "extra"]);

		// Alice's row collapses to two cells; the trailing cell spans two columns.
		const aliceCells = rows[1]!.content ?? [];
		expect(aliceCells).toHaveLength(2);
		expect(cellText(aliceCells[1]!)).toBe("Admin");
		expect(aliceCells[1]!.attrs?.["colspan"]).toBe(2);

		// Bob keeps all three columns.
		expect((rows[2]!.content ?? []).map(cellText)).toEqual(["Bob", "User", "X"]);

		// The "<"/"^" merge markers must never survive into rendered cells.
		expect(allText(table)).not.toContain("<");
		expect(allText(table)).not.toContain("^");
	});

	test("merges a missing cell in a later row into a rowspan", () => {
		// Bob is missing "role", producing a "^" marker that merges upward.
		const doc = toAdf(fence("yaml-table", "- name: Alice\n  role: Admin\n- name: Bob"));
		const table = firstTable(doc)!;
		const rows = table.content ?? [];

		const aliceCells = rows[1]!.content ?? [];
		expect(cellText(aliceCells[1]!)).toBe("Admin");
		expect(aliceCells[1]!.attrs?.["rowspan"]).toBe(2);

		// Bob's "^" cell was absorbed, leaving only his name.
		expect((rows[2]!.content ?? []).map(cellText)).toEqual(["Bob"]);
		expect(allText(table)).not.toContain("^");
	});

	test("leaves a plain yaml code block untouched", () => {
		const doc = toAdf(fence("yaml", "name: Alice\nrole: Admin"));
		expect(firstTable(doc)).toBeUndefined();
		expect((doc.content ?? []).some((node) => node.type === "codeBlock")).toBe(true);
	});
});

// A yaml table is just an alternative syntax for a markdown table: both must
// share the same cell behaviour (no fixed widths, same "<"/"^" merging).
describe("table behaviour parity (yaml vs markdown)", () => {
	test("yaml table cells carry no fixed colwidth", () => {
		const table = firstTable(toAdf(fence("yaml-table", "- name: Alice\n  role: Admin")))!;
		for (const cell of allCells(table)) {
			expect(cell.attrs).toBeDefined();
			expect(cell.attrs).not.toHaveProperty("colwidth");
		}
	});

	test("markdown table cells carry no fixed colwidth", () => {
		const md = ["| name | role |", "| --- | --- |", "| Alice | Admin |"].join("\n");
		const table = firstTable(toAdf(md))!;
		for (const cell of allCells(table)) {
			expect(cell.attrs).not.toHaveProperty("colwidth");
		}
	});

	test("markdown tables honour the same '^' rowspan merge marker", () => {
		const md = ["| a | b |", "| --- | --- |", "| 1 | 2 |", "| 3 | ^ |"].join("\n");
		const table = firstTable(toAdf(md))!;
		const rows = table.content ?? [];

		// The "2" cell absorbs the "^" below it, spanning two rows...
		expect(cellText(rows[1]!.content![1]!)).toBe("2");
		expect(rows[1]!.content![1]!.attrs?.["rowspan"]).toBe(2);
		// ...and the "^" marker cell is removed, so no marker text survives.
		expect((rows[2]!.content ?? []).map(cellText)).toEqual(["3"]);
		expect(allText(table)).not.toContain("^");
	});
});

// Font size is the one place yaml and markdown tables deliberately differ:
// yaml tables are data-dense, so their cells are rendered one size down.
describe("table cell font size", () => {
	test("yaml table cell paragraphs are marked small", () => {
		const table = firstTable(toAdf(fence("yaml-table", "- name: Alice\n  role: Admin")))!;
		for (const cell of allCells(table)) {
			for (const paragraph of cell.content ?? []) {
				expect(paragraph.type).toBe("paragraph");
				expect(paragraph.marks).toContainEqual({
					type: "fontSize",
					attrs: { fontSize: "small" },
				});
			}
		}
	});

	test("markdown table cell paragraphs keep the default font size", () => {
		const md = ["| name | role |", "| --- | --- |", "| Alice | Admin |"].join("\n");
		const table = firstTable(toAdf(md))!;
		for (const cell of allCells(table)) {
			for (const paragraph of cell.content ?? []) {
				expect(paragraph.marks ?? []).not.toContainEqual(
					expect.objectContaining({ type: "fontSize" }),
				);
			}
		}
	});
});
