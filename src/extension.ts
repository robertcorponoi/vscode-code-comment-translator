/**
 * The module `vscode` contains the VS Code extensibility API.
 * Import the module and reference it with the alias `vscode` in the code
 * below.
 */
import * as vscode from "vscode";
import { ReplacementRadixTree } from "./RadixTree";

const API_KEY = "";
const API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Called when the extension is activated.
 *
 * @param {vscode.ExtensionContext} context The context in which the extension is activated.
 */
export const activate = (context: vscode.ExtensionContext) => {
	// Use the console to output diagnostic information (`console.log`) and
	// errors (`console.error`).
	// This line of code will only be executed once when the extension is
	// activated.
	console.log('"code-comment-translator" extension is now active!');

	// Debounces the handler to update the document so that if many files are
	// opened in quick succession, the handler is only called once after the
	// last file is opened.
	const debouncedHandler = debounce((document: vscode.TextDocument) => {
		handleDocumentUpdate(document, context);
	}, 500);

	// I'm not sure why but `onDidOpenTextDocument` runs two or three times so
	// so we need to check if we've already processed the document or not.
	const processedDocuments = new Set<string>();

	// Run the comment modification when the file is opened.
	const openDocumentListener = vscode.workspace.onDidOpenTextDocument(
		(_document) => {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				return;
			}

			if (processedDocuments.has(activeEditor.document.uri.toString())) {
				// The document has already been processed, skip it.
				return;
			}

			// Add the document to the processed set.
			processedDocuments.add(activeEditor.document.uri.toString());

			debouncedHandler(activeEditor.document);
		}
	);

	// Add the listener to the context subscriptions so that the listener can
	// be disposed when the extension is deactivated.
	context.subscriptions.push(openDocumentListener);
};

/**
 * Called when the extension is deactivated.
 */
export const deactivate = () => {};

/**
 * Updates the text in the provided text document.
 *
 * @async
 *
 * @param {vscode.TextDocument} document The text document to update.
 */
const handleDocumentUpdate = async (
	document: vscode.TextDocument,
	context: vscode.ExtensionContext
) => {
	const activeTextEditor = vscode.window.activeTextEditor;
	if (!activeTextEditor) {
		return;
	}

	// The section of text that is visible in the user's current window. We
	// only want to translate text that the user can see.
	const visibleRange = activeTextEditor.visibleRanges[0];
	if (!visibleRange) {
		return;
	}

	// The text in the visible range.
	const text = document.getText(visibleRange);

	// The language to translate the comments to, from the settings in the
	// `settings.json`.
	const languageCodeToTranslateTo = vscode.workspace
		.getConfiguration()
		// @ts-expect-error - The `language` configuration option is one we specify in our `package.json`.
		.get("codeCommentTranslator")?.language;

	// The previously saved translations for the language, if any exist.
	// These are stored as:
	// {
	//     "one cat": "un gato",
	//     "one cat and two dogs": "un gato y dos perros",
	// }
	const previouslySavedTranslations = context.globalState.get(
		languageCodeToTranslateTo
	) as { [key: string]: string };

	// If we have previous translations, create a radix tree from them.
	const tree = new ReplacementRadixTree();
	if (previouslySavedTranslations) {
		for (const [key, value] of Object.entries(
			previouslySavedTranslations
		)) {
			tree.insert(key, value);
		}
	}

	// The id of the programming language of the current file.
	const programmingLanguageId = document.languageId;

	// The regex to get comments based on the programming language.
	const commentRegex = getCommentRegex(programmingLanguageId);

	if (!commentRegex) {
		// If the programming language is not supported, show an error message.
		vscode.window.showWarningMessage(
			`No comment syntax available for the programming language ${programmingLanguageId}.`
		);
		return;
	}

	// Translations are provided as decorations so that they do not affect
	// source control. As we loop through the comments and find words to
	// translate, we add the translations as decorations to the editor.
	const decorations: {
		randomWord: string;
		range: vscode.Range;
		decorationType: vscode.TextEditorDecorationType;
	}[] = [];
	let wordsToTranslate: { randomWord: string; range: vscode.Range }[] = [];

	// Get the start offset of the visible range. When adding decorations, we
	// need to calculate the offset of the decorations relative to the entire
	// document, not just the visible range.
	const visibleStartOffset = document.offsetAt(visibleRange.start);

	// Stores the comment content as we iterate through match groups.
	let match;
	while ((match = commentRegex.exec(text)) !== null) {
		// Extract the comment content from the capturing groups.
		// Group 1 contains the single-line comment content.
		const singleLineComment = match[1];
		// Group 2 contains the multi-line comment content.
		let multiLineComment = match[2];

		// Strip leading `*` from multi-line comments
		if (multiLineComment) {
			multiLineComment = multiLineComment
				// Split into lines
				.split("\n")
				// Remove the leading `*` and trim whitespace.
				.map((line) => line.replace(/^\s*\*/, "").trim())
				// Join the comment back into a single string.
				.join(" ");
		}

		// The comment content is either the single-line comment or the
		// multi-line comment. If neither are present, we skip this iteration.
		const commentContent = singleLineComment || multiLineComment;
		if (!commentContent) {
			continue;
		}

		// Split the comment content by whitespace into words and remove any
		// empty strings.
		const words = commentContent.split(/\s+/).filter(Boolean);

		// Get a random word or phrase from the comment.
		const randomWord = getRandomWordsFromWords(words, 2);
		if (!randomWord) {
			return;
		}

		// Calculate the range of the randomly selected word, with the
		// start index relative to the start of the document.
		const startOffset =
			visibleStartOffset + match.index + match[0].indexOf(randomWord);
		const endOffset = startOffset + randomWord.length;

		// Calculate the range of the randomly selected word in the vscode
		// document.
		const start = document.positionAt(startOffset);
		const end = document.positionAt(endOffset);
		const range = new vscode.Range(start, end);

		// Check if we have a translation for the word or phrase yet.
		const translation = tree.findLongestMatch(randomWord.split(" "), 0);

		// If there was a translation for the word, add it to the
		// `decorations` so that it's ready to go. Otherwise, add it to
		// `wordsToTranslate` so that we can translate it before making
		// the decorator.
		if (translation) {
			// Create the decorator with the translation.
			const decorationType = vscode.window.createTextEditorDecorationType(
				{
					before: {
						contentText: `[`,
						color: "gray",
					},
					after: {
						contentText: `] ${translation[0]}`,
						color: "gray",
					},
				}
			);
			decorations.push({ randomWord, decorationType, range });
		} else {
			wordsToTranslate.push({
				randomWord,
				range,
			});
		}
	}

	if (wordsToTranslate.length > 0) {
		// Batch translate all the words or phrases that need to be translated.
		const toTranslate = wordsToTranslate.map(({ randomWord }) => {
			return randomWord;
		});
		const translated = await translateText(
			toTranslate,
			"en",
			languageCodeToTranslateTo
		);
		if (!translated) {
			return;
		}

		// The translated words should come back in the same order, as a comma
		// separated string. We need to split them to get the individual words.
		const translatedWords = translated
			.replaceAll("'", "")
			.split(",")
			.map((word) => word.trim());
		if (translatedWords.length === 0) {
			return;
		}

		translatedWords.forEach((translation, index) => {
			if (!wordsToTranslate[index]) {
				return;
			}

			// Since the translated words should be in the same order as
			// the input, we can use the index to get the corresponding
			// range.
			const { randomWord, range } = wordsToTranslate[index];

			// Add the word and its translation to the radix tree so that if
			// we see the word again, we can use the translation and not have
			// to make another API call.
			tree.insert(randomWord, translation);
			context.globalState.update(languageCodeToTranslateTo, {
				...context.globalState.get(languageCodeToTranslateTo),
				[randomWord]: translation,
			});

			// Create the decorator with the translation.
			const decorationType = vscode.window.createTextEditorDecorationType(
				{
					before: {
						contentText: `[`,
						color: "gray",
					},
					after: {
						contentText: `] ${translation}`,
						color: "gray",
					},
				}
			);
			decorations.push({ randomWord, decorationType, range });
		});

		// Clear the words to translate because it's rude to leave a mess.
		wordsToTranslate = [];
	}

	// Apply the decorations.
	decorations.forEach(({ decorationType, range }) => {
		activeTextEditor.setDecorations(decorationType, [range]);
	});
};

/**
 * Returns the regex to get comments based on the programming language of the
 * provided language id.
 *
 * @param {string} languageId The id of the programming language.
 *
 * @returns {RegExp|null} The regex to get comments based on the programming language or `null` if the programming language is not supported.
 */
const getCommentRegex = (languageId: string): RegExp | null => {
	/**
	 * The language ids mapped to the regex to get comments.
	 *
	 * This is defined here so that it only exists when it is needed.
	 */
	const commentPatterns: { [key: string]: RegExp } = {
		typescript: /\/\/(.*)|\/\*([\s\S]*?)\*\//g,
		typescriptreact: /\/\/(.*)|\/\*([\s\S]*?)\*\//g,
	};

	return commentPatterns[languageId] || null;
};

/**
 * Returns one or more random words from the provided words.
 *
 * @param {string} words The words to get one or more random words from.
 * @param {number} [wordCount=1] The number of random words to get from the provided words.
 *
 * @returns {string[]} Returns one or more random words from the provided words.
 */
const getRandomWordsFromWords = (
	words: string[],
	wordCount: number
): string | null => {
	if (wordCount < 1) {
		// Nice try, but that won't work...mostly because I'm not sure how it
		// would work. Would I have to *add** to the comment?
		return null;
	}

	// The index to start pulling words from.
	const randomIndex = getRandomNumberInRange(0, words.length - 1);
	const randomWord = words[randomIndex];

	if (wordCount === 1) {
		// If we only need to pull one word from the comment, just return it.
		return randomWord;
	} else {
		// The number of words after the random word.
		const wordsAfterRandomWord = words.length - randomIndex - 1;

		// The number of words that we can get after the random word, up to
		// the number of words that we need to get.
		const wordsAfterRandomWordCalculated =
			wordsAfterRandomWord > wordCount ? wordCount : wordsAfterRandomWord;

		// Return the words starting from the random word up to
		// `wordsAfterRandomWordCalculated`.
		return words
			.slice(randomIndex, randomIndex + wordsAfterRandomWordCalculated)
			.join(" ");
	}
};

/**
 * Translates the provided text from the source language to the target
 * language.
 *
 * @async
 *
 * @param {string[]} text The text to translate. Words and phrases should be separated by commas.
 * @param {string} sourceLanguageCode The language code of the source text.
 * @param {string} targetLanguageCode The language code to translate the text to.
 */
const translateText = async (
	text: string[],
	sourceLanguageCode: string,
	targetLanguageCode: string
): Promise<string | undefined> => {
	const payload = {
		// Use `gpt-4o-mini` to save some money.
		model: "gpt-4o-mini",
		messages: [
			{
				role: "system",
				// Attempt to translate phrases together instead of as
				// individual words.
				// Return JSON so we can easily parse the results.
				content:
					"You are a professional translator. Provide accurate translations. Each group of words to translate is separated by a comma. Return the results in the same order, as a comma separated string.",
			},
			{
				role: "user",
				content: `Translate the following from ${sourceLanguageCode} to ${targetLanguageCode}: '${text}'`,
			},
		],
	};

	try {
		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${API_KEY}`,
			},
			body: JSON.stringify(payload),
		});

		const json = await response.json();
		if (!json) {
			throw new Error("Failed to translate text.");
		}

		// @ts-expect-error - The response properties are not defined in the type.
		return json.choices[0].message.content.trim();
	} catch (error) {
		console.error("Error during translation:", error);
		throw new Error("Failed to translate text.");
	}
};

/**
 * Used to ensure that a function is only executed after a specified delay
 * once the event stops firing.
 *
 * @param {(document: vscode.TextDocument) => void} fn The function to execute.
 * @param {number} delay The delay in milliseconds.
 */
const debounce = (
	fn: (document: vscode.TextDocument) => void,
	delay: number
) => {
	let timeout: NodeJS.Timeout;

	return (document: vscode.TextDocument) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(document), delay);
	};
};

/**
 * Returns a random number between the minimum and maximum values, inclusive.
 *
 * @param {number} min The minimum value.
 * @param {number} max The maximum value.
 *
 * @returns {number} A random number between the minimum and maximum values, inclusive.
 */
export const getRandomNumberInRange = (min: number, max: number): number => {
	return Math.floor(Math.random() * (max - min + 1)) + min;
};
