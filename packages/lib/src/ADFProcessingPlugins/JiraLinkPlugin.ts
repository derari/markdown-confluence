import { traverse } from "@atlaskit/adf-utils/traverse";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ADFProcessingPlugin, PublisherFunctions } from "./types";
import { ADFEntity } from "@atlaskit/adf-utils/types";

export interface JiraLink {
	issueId: string;
}

export class JiraLinkPlugin implements ADFProcessingPlugin<string, string> {
	constructor(private jiraUrl: string) {}

	extract(_adf: JSONDocNode): string {
		return "no-op";
	}

	async transform(
		items: string,
		_supportFunctions: PublisherFunctions,
	): Promise<string> {
		return items;
	}

	load(adf: JSONDocNode, _transformed: string): JSONDocNode {
		let afterAdf = adf as ADFEntity;

		afterAdf =
			traverse(afterAdf, {
				text: (node, _parent) => {
					if (!node.text?.startsWith("JIRA:")) return;
					if ((node.marks || [])[0]?.["type"] !== "code") return;
					const text = node.text;
					const issueId = text.substring(
						text.startsWith("JIRA:-") ? 6 : 5,
					);
					node.type = "inlineCard";
					node.attrs = {
						url: `${this.jiraUrl}/browse/${issueId}`,
					};
					delete node.marks;
					delete node.text;
					return node;
				},
			}) || afterAdf;

		return afterAdf as JSONDocNode;
	}
}
