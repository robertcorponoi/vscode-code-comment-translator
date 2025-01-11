import tsParser from "@typescript-eslint/parser";
import typescriptEslint from "@typescript-eslint/eslint-plugin";

export default [
	{
		// Specifies the files that the configuration objects should apply to.
		// https://eslint.org/docs/latest/use/configure/configuration-files#specifying-files-and-ignores
		files: ["**/*.ts"],
	},
	{
		// Plugins that extend ESLint functionality.
		// https://eslint.org/docs/latest/use/configure/plugins
		plugins: {
			// TypeScript support for ESLint.
			// https://github.com/typescript-eslint/typescript-eslint
			"@typescript-eslint": typescriptEslint,
		},
		// The JS language options to support.
		// https://eslint.org/docs/latest/use/configure/language-options
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: "module",
		},
		// The rules to use to validate our code.
		// https://eslint.org/docs/latest/use/configure/rules
		rules: {
			// Make sure our imports use either camelCase or PascalCase.
			// https://typescript-eslint.io/rules/naming-convention/
			"@typescript-eslint/naming-convention": [
				"warn",
				{
					selector: "import",
					format: ["camelCase", "PascalCase"],
				},
			],
			// Warn if we omit curly braces.
			// https://eslint.org/docs/latest/rules/curly
			curly: "warn",
			// Warn if we use the `==` or `!=` instead of `===` and `!==`
			// operators.
			// https://eslint.org/docs/latest/rules/eqeqeq
			eqeqeq: "warn",
			// Warn if we don't throw an error with `throw new Error()`.
			// https://eslint.org/docs/latest/rules/no-throw-literal
			"no-throw-literal": "warn",
			// Warn if we don't use semicolons.
			// https://eslint.org/docs/latest/rules/semi
			semi: "warn",
		},
	},
];
