import sortAny from "sort-any";
import { mapValues } from "lodash-es";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { ADFEntity, ADFEntityMark } from "@atlaskit/adf-utils/types";
import { isEqual } from "./isEqual";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sortDeep = (object: unknown): any => {
	if (object instanceof Map) {
		return sortAny([...object]);
	}
	if (!Array.isArray(object)) {
		if (typeof object !== "object" || object === null || object instanceof Date) {
			return object;
		}

		return mapValues(object, sortDeep);
	}

	return sortAny(object.map(sortDeep));
};

export function orderMarks(adf: ADFEntity) {
	return traverse(adf, {
		any: (node, __parent) => {
			if (node.marks) {
				node.marks = sortDeep(node.marks);
			}
			return node;
		},
	});
}

// Confluence stores a page link without its trailing page-title slug
// (".../pages/123/Some+Title" -> ".../pages/123"). Strip it so a locally
// generated link compares equal to what the server returns.
const confluencePagePathRegex = /^(\/wiki\/spaces\/(?:~)?\w+\/pages\/\d+)(?:\/.*)?$/;

function stripConfluencePageTitle(href: string): string {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return href;
	}

	const match = url.pathname.match(confluencePagePathRegex);
	if (match?.[1]) {
		url.pathname = match[1];
		return url.href;
	}

	return href;
}

// Normalises an ADF tree to the canonical form Confluence stores, so an
// unchanged page is not reported as different by adfEqual:
//  - orders marks (mark order is not significant)
//  - strips the page-title slug from Confluence page links and inline cards
//  - fills in the default table `layout` that Confluence adds server-side
//  - drops server-assigned attrs the generator cannot predict (attrs.localId,
//    macroId/schemaVersion inside macro metadata, mediaSingle width/widthType)
function normalizeAdf(adf: ADFEntity) {
	return traverse(adf, {
		any: (node, __parent) => {
			if (node.marks) {
				const sortedMarks = sortDeep(node.marks) as ADFEntityMark[];
				node.marks = sortedMarks;
				for (const mark of sortedMarks) {
					if (mark?.type === "link" && typeof mark.attrs?.["href"] === "string") {
						mark.attrs["href"] = stripConfluencePageTitle(mark.attrs["href"]);
					}
				}
			}
			if (node.type === "inlineCard" && typeof node.attrs?.["url"] === "string") {
				node.attrs["url"] = stripConfluencePageTitle(node.attrs["url"]);
			}
			if (node.type === "table") {
				node.attrs = { layout: "default", ...(node.attrs ?? {}) };
			}
			if (node.type === "mediaSingle" && node.attrs) {
				// Confluence inserts width/widthType on mediaSingle; the generator
				// cannot predict them, so ignore both.
				delete node.attrs["width"];
				delete node.attrs["widthType"];
			}
			if (node.attrs) {
				// localId is assigned by Confluence and cannot be predicted.
				delete node.attrs["localId"];
				// Confluence stamps a macroId (a UUID) and a schemaVersion into
				// macro metadata; neither is generatable, so ignore both.
				const parameters = node.attrs["parameters"] as
					| { macroMetadata?: Record<string, unknown> }
					| undefined;
				if (parameters?.macroMetadata) {
					delete parameters.macroMetadata["macroId"];
					delete parameters.macroMetadata["schemaVersion"];
				}
			}
			return node;
		},
	});
}

function cloneAdf(adf: ADFEntity): ADFEntity {
	return JSON.parse(JSON.stringify(adf));
}

export function adfEqual(first: ADFEntity, second: ADFEntity): boolean {
	// Clone so normalisation never mutates the caller's ADF (e.g. the ADF that
	// is about to be uploaded).
	const a = normalizeAdf(cloneAdf(first));
	const b = normalizeAdf(cloneAdf(second));
	const equal = isEqual(a, b);
	// Debug: use native console.log (this is a plain function, not an Effect, so
	// effect's Console.log would build an Effect that never runs). Logs the
	// NORMALISED ADF that is actually compared, so a diff reveals the mismatch.
	if (!equal) {
		console.log("[adfEqual] normalised current page ADF:\n" + JSON.stringify(a, null, 2));
		console.log("[adfEqual] normalised generated ADF:\n" + JSON.stringify(b, null, 2));
	} else {
		console.log("[adfEqual] normalised ADF is equal");
	}
	return equal;
}

export function marksEqual(
	first: ADFEntityMark[] | undefined,
	second: ADFEntityMark[] | undefined,
) {
	if (first === second) {
		return true;
	}

	return isEqual(sortDeep(first), sortDeep(second));
}
