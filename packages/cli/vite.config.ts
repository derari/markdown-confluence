import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { defineConfig, type Plugin } from "vite-plus";
import { generatedBanner, isNodeBuiltin } from "../../vite.package-build.ts";

const NodePlatformLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

function runNodePlatform<A>(effect: Effect.Effect<A, unknown, FileSystem | Path>) {
	return Effect.runPromise(effect.pipe(Effect.provide(NodePlatformLive)));
}

function copyRendererHtmlPlugin(): Plugin {
	return {
		apply: "build",
		name: "copy-mermaid-renderer-html",
		async closeBundle() {
			await runNodePlatform(
				Effect.gen(function* () {
					const fs = yield* FileSystem;
					const path = yield* Path;
					const source = path.resolve(
						"../mermaid-puppeteer-renderer/dist/mermaid_renderer.html",
					);
					const target = path.resolve("dist/mermaid_renderer.html");

					yield* fs.makeDirectory(path.dirname(target), { recursive: true });
					yield* fs.copyFile(source, target);

					// Mark dist/ as ES modules so the bundle runs as ESM even when it
					// is copied away from the package root (e.g. `COPY ./dist /app` in
					// the Docker image), without relying on the root package.json.
					yield* fs.writeFileString(
						path.resolve("dist/package.json"),
						`${JSON.stringify({ type: "module" }, null, 2)}\n`,
					);
				}),
			);
		},
	};
}

// The bundle is emitted as ESM, but bundled CommonJS dependencies still call
// `require(...)` for externalized Node builtins. ESM has no `require`, so we
// provide one via createRequire. See:
// https://rolldown.rs/in-depth/bundling-cjs#require-external-modules
const esmRequireShim = [
	'import { createRequire as __createRequire } from "node:module";',
	"const require = __createRequire(import.meta.url);",
	"",
].join("\n");

export default defineConfig({
	build: {
		emptyOutDir: true,
		lib: {
			entry: "src/index.ts",
			fileName: () => "index.js",
			formats: ["es"],
		},
		minify: true,
		rollupOptions: {
			external: isNodeBuiltin,
			output: {
				banner: `${generatedBanner}${esmRequireShim}`,
				codeSplitting: false,
			},
		},
		sourcemap: true,
		target: "node16",
	},
	plugins: [copyRendererHtmlPlugin()],
	resolve: {
		mainFields: ["module", "main"],
	},
});
