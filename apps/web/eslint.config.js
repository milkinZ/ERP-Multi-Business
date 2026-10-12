import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
	...nextJsConfig,
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
				projectService: {
					allowDefaultProject: ['eslint.config.js', 'postcss.config.mjs'],
				},
			},
		},
	},
];
