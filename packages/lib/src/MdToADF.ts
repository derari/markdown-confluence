import {
	JSONDocNode,
	JSONTransformer,
} from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { MarkdownFile } from "./adaptors";
import { LocalAdfFile } from "./Publisher";
import { processConniePerPageConfig } from "./ConniePageConfig";
import { MarkdownToConfluenceCodeBlockLanguageMap } from "./CodeBlockLanguageMap";
import {
	isSafeUrl,
	TableCellDefinition,
	TableDefinition,
	TableHeaderDefinition,
	type TableRowDefinition,
} from "@atlaskit/adf-schema";
import { ConfluenceSettings } from "./Settings";
import { cleanUpUrlIfConfluence } from "./ConfluenceUrlParser";
import {
	p,
	tableHeader,
	tableRow,
	table,
	tableCell,
} from "@atlaskit/adf-utils/builders";
import { ADFEntity } from "@atlaskit/adf-utils/dist/types/types";
import {
	TableCell,
	TableHeader,
} from "@atlaskit/adf-schema/dist/types/schema/nodes/tableNodes";

const yaml = require("js-yaml");

const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---\s*/g;

const transformer = new MarkdownTransformer();
const serializer = new JSONTransformer();

export function parseMarkdownToADF(
	frontmatter: { [key: string]: unknown },
	markdown: string,
	confluenceBaseUrl: string,
) {
	const prosenodes = transformer.parse(markdown);
	// @ts-ignore
	const adfNodes = serializer.encode(prosenodes);
	const nodes = processADF(adfNodes, frontmatter, confluenceBaseUrl);
	return nodes;
}

function parseMarkdownToADFParagraph(
	frontmatter: { [key: string]: unknown },
	markdown: string,
	confluenceBaseUrl: string,
) {
	const doc = parseMarkdownToADF(frontmatter, markdown, confluenceBaseUrl);
	return doc.content;
}

function processADF(
	adf: JSONDocNode,
	frontmatter: { [key: string]: unknown },
	confluenceBaseUrl: string,
): JSONDocNode {
	convertSpecialBlocks(adf, frontmatter, confluenceBaseUrl);
	const olivia = traverse(adf, {
		text: (node, _parent) => {
			if (_parent.parent?.node?.type == "listItem" && node.text) {
				node.text = node.text
					.replaceAll(/^\[[xX]\]/g, "✅")
					.replaceAll(/^\[[ ]\]/g, "🔲")
					.replaceAll(/^\[[*]\]/g, "⭐️");
			}

			if (!(node.marks && node.marks[0])) {
				return node;
			}

			const mark = node.marks[0];
			if (mark.type === "code") {
				const match = node.text?.match(/\[!!(\w+):(.+)]/);
				if (!match) return node;
				return {
					type: "status",
					attrs: {
						text: match[2],
						color: getBadgeColor(match[1] ?? ""),
					},
				};
			}

			if (!(mark.attrs && "href" in mark.attrs)) {
				return node;
			}

			if (
				mark.attrs["href"] === "" ||
				(!isSafeUrl(mark.attrs["href"]) &&
					!(mark.attrs["href"] as string).startsWith("wikilinks:") &&
					!(mark.attrs["href"] as string).startsWith("mention:"))
			) {
				mark.attrs["href"] = "#";
			}

			if (mark.attrs["href"] === node.text) {
				const cleanedUrl = cleanUpUrlIfConfluence(
					mark.attrs["href"],
					confluenceBaseUrl,
				);
				node.type = "inlineCard";
				node.attrs = { url: cleanedUrl };
				delete node.marks;
				delete node.text;
			}

			return node;
		},
		table: (node, _parent) => {
			if (
				node.attrs &&
				"isNumberColumnEnabled" in node.attrs &&
				node.attrs["isNumberColumnEnabled"] === false
			) {
				delete node.attrs["isNumberColumnEnabled"];
			}
			mergeCells(node as TableDefinition);
			return node;
		},
		tableRow: (node, _parent) => {
			return node;
		},
		tableHeader: (node, _parent) => {
			if (!node.attrs) node.attrs = {};
			if (!node.attrs["colspan"]) node.attrs["colspan"] = 1;
			if (!node.attrs["rowspan"]) node.attrs["rowspan"] = 1;
			// if (!node.attrs["colwidth"]) node.attrs["colwidth"] = [340];
			return node;
		},
		tableCell: (node, _parent) => {
			if (!node.attrs) node.attrs = {};
			if (!node.attrs["colspan"]) node.attrs["colspan"] = 1;
			if (!node.attrs["rowspan"]) node.attrs["rowspan"] = 1;
			// if (!node.attrs["colwidth"]) node.attrs["colwidth"] = [340];
			return node;
		},
		orderedList: (node, _parent) => {
			node.attrs = { order: 1 };
			return node;
		},
		bulletList: (node, _parent) => {
			if (isTaskList(node.content)) {
				node.type = "taskList";
				node.attrs = {};
				for (const item of node.content!) {
					listItemToTaskItem(item!);
				}
			}
			return node;
		},
		codeBlock: (node, _parent) => {
			if (!node || !node.attrs) {
				return;
			}

			if (Object.keys(node.attrs).length === 0) {
				delete node.attrs;
				return node;
			}

			const codeBlockLanguage = (node.attrs || {})?.[
				"language"
			] as string;

			if (codeBlockLanguage in MarkdownToConfluenceCodeBlockLanguageMap) {
				node.attrs["language"] =
					MarkdownToConfluenceCodeBlockLanguageMap[codeBlockLanguage];
			}

			if (codeBlockLanguage === "adf") {
				if (!node?.content?.at(0)?.text) {
					return node;
				}
				try {
					const parsedAdf = JSON.parse(
						node?.content?.at(0)?.text ??
							JSON.stringify(
								p("ADF missing from ADF Code Block."),
							),
					);
					node = parsedAdf;
					return node;
				} catch (e) {
					return node;
				}
			}

			if (
				codeBlockLanguage.startsWith("yaml-table") ||
				codeBlockLanguage.startsWith("yaml table")
			) {
				if (!node?.content?.at(0)?.text) {
					return node;
				}
				try {
					const parsedYaml = yaml.load(node?.content?.at(0)?.text);
					return yamlToTable(
						parsedYaml,
						frontmatter,
						confluenceBaseUrl,
					);
				} catch (e) {
					console.log(e);
					return node;
				}
			}

			return node;
		},
		panel: (node, _parent) => {
			if (!node.attrs) return node;
			if (node.attrs["panelType"] === "toc") {
				return calloutAsToc();
			}
			if (node.attrs["panelType"] === "excerpt") {
				return calloutAsExcerpt(node, frontmatter, confluenceBaseUrl);
			}
			if (node.attrs["panelType"] === "properties") {
				return calloutAsProperties(
					node,
					frontmatter,
					confluenceBaseUrl,
				);
			}
			return node;
		},
	});

	if (!olivia) {
		throw new Error("Failed to traverse");
	}

	return olivia as JSONDocNode;
}

function convertSpecialBlocks(
	node: JSONDocNode,
	frontmatter: { [key: string]: unknown },
	confluenceBaseUrl: string,
) {
	const headerIndices = [-1, -1, -1, -1, -1, -1, -1];
	let lastHeader = -1;
	for (let i = 0; i < node.content.length; i++) {
		const child = node.content[i];
		if (child?.type === "heading" && child.attrs) {
			// @ts-ignore
			const level = child.attrs["level"];
			if (level > 0 && level < 7) {
				headerIndices[level] = i;
				lastHeader = i;
			}
		}
		if (
			child?.type === "paragraph" &&
			child.content &&
			child.content.length === 1
		) {
			const paragraphChild = child.content[0];
			if (paragraphChild?.type === "text" && paragraphChild.text) {
				const text = paragraphChild.text.match(
					/\^(excerpt|properties)(?:-(\d))?(?:-(.*))?/,
				);
				if (text) {
					const start = text[2]
						? headerIndices[parseInt(text[2])]! + 1
						: lastHeader + 1;
					const extracted = {
						content: node.content.slice(start, i),
					} as ADFEntity;
					node.content.splice(start, i - start);
					i = start;
					if (text[1] === "excerpt") {
						includeFrontmatterTable(
							frontmatter,
							text[3] || "Excerpt",
							confluenceBaseUrl,
							extracted.content!,
						);
						node.content[i] = asExcerptNode(
							extracted,
							text[3] || "Excerpt",
						);
					} else {
						includeFrontmatterTable(
							frontmatter,
							text[3] || "Properties",
							confluenceBaseUrl,
							extracted.content!,
						);
						node.content[i] = asPropertiesNode(
							extracted,
							text[3] || "Properties",
						);
					}
				}
			}
		}
	}
}

function calloutAsToc() {
	return {
		type: "extension",
		attrs: {
			layout: "default",
			extensionType: "com.atlassian.confluence.macro.core",
			extensionKey: "toc",
			parameters: {
				macroParams: {
					style: {
						value: "default",
					},
				},
				macroMetadata: {
					title: "Table of Contents",
				},
			},
		},
	};
}

function calloutAsExcerpt(
	node: ADFEntity,
	frontmatter: { [p: string]: unknown },
	confluenceBaseUrl: string,
) {
	let name = "Excerpt";
	let content = node.content || [];
	if (content.length > 0 && content[0]?.type === "paragraph") {
		content = content[0].content || [];
	}
	if (content.length > 2 && content[1]?.type === "hardBreak") {
		name = content[0]?.text ?? name;
		content.splice(0, 2);
	}
	includeFrontmatterTable(frontmatter, name, confluenceBaseUrl, content);
	return asExcerptNode(node, name);
}

function asExcerptNode(node: ADFEntity, name: string) {
	node.type = "bodiedExtension";
	node.attrs = {
		layout: "default",
		extensionType: "com.atlassian.confluence.macro.core",
		extensionKey: "excerpt",
		parameters: {
			macroParams: {
				name: {
					value: name,
				},
				// eslint-disable-next-line @typescript-eslint/naming-convention
				"atlassian-macro-output-type": {
					value: "INLINE",
				},
			},
			macroMetadata: {
				macroId: {
					value: "f638cbb0-4cf8-403a-af66-7a5be22b744e",
				},
				schemaVersion: {
					value: "1",
				},
				title: "Excerpt",
			},
		},
	};
	return node;
}

function calloutAsProperties(
	node: ADFEntity,
	frontmatter: { [p: string]: unknown },
	confluenceBaseUrl: string,
) {
	let key = "Properties";
	let content = node.content || [];
	if (content.length > 0 && content[0]?.type === "paragraph") {
		content = content[0].content || [];
	}
	if (content.length > 0) {
		key = content[0]?.text ?? key;
		content.splice(0, 2);
	}
	key = includeFrontmatterTable(frontmatter, key, confluenceBaseUrl, content);
	return asPropertiesNode(node, key);
}

function asPropertiesNode(node: ADFEntity, key: string) {
	node.type = "bodiedExtension";
	node.attrs = {
		layout: "default",
		extensionType: "com.atlassian.confluence.macro.core",
		extensionKey: "details",
		parameters: {
			macroParams: {
				id: {
					value: key,
				},
			},
			macroMetadata: {
				macroId: {
					value: "fa274a790b8e7d05612ca1a9de859c8b1063d72d6a8f8dcd59b651715fe220b6",
				},
				schemaVersion: {
					value: "1",
				},
				title: "Page Properties",
			},
		},
	};
	return node;
}

function includeFrontmatterTable(
	frontmatter: { [p: string]: unknown },
	key: string,
	confluenceBaseUrl: string,
	content: (ADFEntity | undefined)[],
) {
	let data = frontmatter[key];
	if (!data) {
		key = key.toLowerCase().replaceAll(" ", "-");
		data = frontmatter[key];
	}
	if (data) {
		content.push(yamlToTable(data, frontmatter, confluenceBaseUrl));
	}
	return key;
}

function yamlToTable(
	yaml: unknown,
	frontmatter: { [p: string]: unknown },
	confluenceBaseUrl: string,
) {
	const headerLabels: string[] = [];
	const headers: TableHeaderDefinition[] = [];
	// @ts-ignore
	const rows: TableRowDefinition[] = [tableRow(headers)];
	const contentRows: TableRowDefinition[] = [];

	if (!Array.isArray(yaml)) yaml = [yaml];
	// @ts-ignore
	yaml.forEach((entry) => {
		const row = entryAsRow(
			entry,
			headerLabels,
			headers,
			contentRows,
			frontmatter,
			confluenceBaseUrl,
		);
		// @ts-ignore
		rows.push(row);
		// @ts-ignore
		contentRows.push(row);
	});
	const t = table();
	t.content = rows;
	mergeCells(t);
	return t;
}

function entryAsRow(
	data: any,
	headerLabels: string[],
	headers: TableHeaderDefinition[],
	contentRows: TableRowDefinition[],
	frontmatter: { [p: string]: unknown },
	confluenceBaseUrl: string,
) {
	const values: TableCellDefinition[] = [];
	for (const k of Object.keys(data)) {
		if (!headerLabels.includes(k)) {
			console.log("column " + headerLabels.length + " = " + k);
			headerLabels.push(k);
			const th = tableHeader({})(p(""));
			// @ts-ignore
			th.content = parseMarkdownToADFParagraph(
				frontmatter,
				`${k}`,
				confluenceBaseUrl,
			);
			// @ts-ignore
			headers.push(th);
			contentRows.forEach((row) => {
				// @ts-ignore
				row.content.push(tableCell({})(p("<")));
			});
		}
	}
	headerLabels.forEach((label) => {
		if (data[label]) {
			const tv = tableCell({})(p(""));
			// @ts-ignore
			tv.content = parseMarkdownToADFParagraph(
				frontmatter,
				`${data[label]}`,
				confluenceBaseUrl,
			);
			// @ts-ignore
			values.push(tv);
		} else {
			// @ts-ignore
			values.push(tableCell({})(p("^")));
		}
	});
	return tableRow(values);
}

function mergeCells(table: TableDefinition) {
	const rows = table.content;
	for (let rowId = rows.length - 1; rowId >= 0; rowId--) {
		const row = rows[rowId]!;
		for (let colId = row.content.length - 1; colId >= 0; colId--) {
			const cell = row.content[colId]!;
			if (hasContentString(cell, "^")) {
				console.log("found ^ at " + rowId + ", " + colId);
				incrementAttr(table, rowId - 1, colId, cell, "rowspan");
				row.content.splice(colId, 1);
			} else if (hasContentString(cell, "<")) {
				console.log("found < at " + rowId + ", " + colId);
				incrementAttr(table, rowId, colId - 1, cell, "colspan");
				row.content.splice(colId, 1);
			}
		}
	}
}

function hasContentString(node: ADFEntity, expected: string) {
	let content = node.content;
	if (content && content.length > 0 && content[0]?.type === "paragraph") {
		content = content[0].content || [];
	}
	if (content && content.length > 0) {
		const text = content[0]?.text ?? "";
		return text === expected;
	}
	return false;
}

function incrementAttr(
	table: TableDefinition,
	rowId: number,
	colId: number,
	src: TableHeader | TableCell,
	key: "rowspan" | "colspan",
) {
	if (rowId < 0 || colId < 0 || rowId >= table.content.length) {
		return;
	}
	console.log("incrementing " + key + " at " + rowId + ", " + colId);
	const rows = table.content;
	const row = rows[rowId];
	if (!row) return;
	for (const cell of row.content) {
		if (!cell.attrs) cell.attrs = {};
		colId -= cell.attrs.colspan || 1;
		if (colId == -1) {
			const amount = src.attrs![key] || 1;
			if (!cell.attrs[key]) {
				cell.attrs[key] = 1 + amount;
			} else {
				cell.attrs[key] = (cell.attrs[key] as number) + amount;
			}
		}
		if (colId < 0) return;
	}
}

function isTaskList(content: Array<ADFEntity | undefined> | undefined) {
	if (!content) return false;
	for (const node of content) {
		if (node?.type !== "listItem") return false;
		if (node.content) {
			for (const child of node.content) {
				if (
					child?.type === "paragraph" &&
					child.content &&
					child.content.length > 0 &&
					child.content[0]?.text &&
					child.content[0].text.match(/^\[.?].*/)
				) {
					return true;
				}
			}
		}
	}
	return false;
}

function listItemToTaskItem(node: ADFEntity) {
	node.type = "taskItem";
	const textNode = node.content![0]!.content![0]!;
	const match = textNode.text!.match(/^\[.?]\s*/)!;
	textNode.text = textNode.text!.substring(match[0].length);
	const check = match[0].slice(1, 2);
	if (check === " " || check == "]") {
		node.attrs = { state: "TODO" };
	} else {
		node.attrs = { state: "DONE" };
	}
	node.content = [textNode];
}

function getBadgeColor(key: string) {
	switch (key) {
		case "example":
		case "hint":
		case "important":
		case "tip":
			return "purple";
		case "info":
		case "note":
		case "todo":
			return "blue";
		case "check":
		case "success":
		case "done":
			return "green";
		case "faq":
		case "help":
		case "question":
		case "attention":
		case "caution":
		case "warning":
			return "yellow";
		case "bug":
		case "danger":
		case "error":
		case "fail":
		case "failure":
		case "missing":
			return "red";
		default:
			return "grey";
	}
}

export function convertMDtoADF(
	file: MarkdownFile,
	settings: ConfluenceSettings,
): LocalAdfFile {
	file.contents = file.contents.replace(frontmatterRegex, "");

	const adfContent = parseMarkdownToADF(
		file.frontmatter,
		file.contents,
		settings.confluenceBaseUrl,
	);

	const results = processConniePerPageConfig(file, settings, adfContent);

	return {
		...file,
		...results,
		contents: adfContent,
	};
}
