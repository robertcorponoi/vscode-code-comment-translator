type RadixNode = {
	/**
	 * An array of strings representing the sequence of words stored in the
	 * node.
	 *
	 * For example, if storing "one cat", the phrase would be ["one", "cat"].
	 *
	 * This optimizes for matching whole words rather than individual
	 * characters.
	 */
	phrase: string[];
	/**
	 * An optional string that provides the replacement text for when the
	 * node's phrase is matched.
	 *
	 * For example, if the phrase is ["one", "cat"], the replacement might be
	 * "un gato".
	 */
	replacement?: string;
	/**
	 * Indicates whether this node represents the end of a complete phrase to
	 * replace.
	 *
	 * For example, if we have these phrases:
	 * "one cat" -> "un gato"
	 * "one cat and two" -> "un gato y dos"
	 *
	 * The tree would look like:
	 * Root
	 * - ["one", "cat"] (isEndOfWord = true, replacement = "un gato")
	 *   - ["and", "two"] (isEndOfWord = true, replacement = "un gato y dos")
	 *
	 * In this case, the node containing ["one", "cat"] has
	 * `isEndOfWord = true` because "one cat" is a complete phrase we want to
	 * replace.
	 * It also has a child node ["and", "two"] which is also a valid ending.
	 *
	 * When we're matching text like "I have one cat at home", we need to know
	 * that the node containing ["one", "cat"] is a valid replacement point,
	 * even though it has children.
	 *
	 * Without `isEndOfWord`, we wouldn't know whether:
	 * 1. The node represents a complete phrase that should trigger a
	 * replacement.
	 * 2. The node is just an intermediate node that happens to be part of a
	 * longer phrase.
	 */
	isEndOfWord: boolean;
	/**
	 * A map of all child radix nodes, with the key being the first word of
	 */
	children: Map<string, RadixNode>;
};

/**
 * A radix tree designed for phrase matching and replacement.
 */
export class ReplacementRadixTree {
	/**
	 * The root node of the radix tree.
	 */
	private root: RadixNode;

	/**
	 * Creates the root node of the radix tree.
	 */
	constructor() {
		this.root = {
			phrase: [],
			children: new Map(),
			isEndOfWord: false,
		};
	}

	/**
	 * Find how many words the two arrays share from their beginning.
	 *
	 * This function is important when:
	 * 1. Inserting new phrases, we need to know how much of an existing path
	 * we can reuse.
	 * 2. Splitting nodes. When we find a partial match, we need to know where
	 * to split the node.
	 *
	 * For example, if our tree has the phrase "one cat" and we're inserting
	 * "one dog", `findCommonPrefix` will tell us that we can share the "one"
	 * part, but we need to split after that.
	 *
	 * @private
	 *
	 * @param {string[]} a The first array.
	 * @param {string[]} b The second array.
	 *
	 * @returns {number} The number of words the two arrays share from their beginning.
	 *
	 * @example
	 *
	 * ```ts
	 * a = ["one", "cat", "is"];
	 * b = ["one", "cat", "was"];
	 * findCommonPrefix(a, b); // Returns 2 because "one" and "cat" match.
	 *
	 * a = ["one", "cat"];
	 * b = ["one", "dog"];
	 * findCommonPrefix(a, b); // Returns 1 because only "one" matches.
	 *
	 * a = ["one", "cat", "is"];
	 * b = ["one", "cat"];
	 * findCommonPrefix(a, b); // Returns 2 because "one" and "cat" match.
	 *
	 * a = ["big", "cat"];
	 * b = ["small", "cat"];
	 * findCommonPrefix(a, b); // Returns 0 because no words match at the start.
	 * ```
	 */
	private findCommonPrefix = (a: string[], b: string[]): number => {
		let i = 0;
		const len = Math.min(a.length, b.length);

		while (i < len && a[i] === b[i]) {
			i++;
		}

		return i;
	};

	/**
	 * Adds a phrase to the tree with a replacement, splitting nodes as needed.
	 *
	 * @param {string} phrase The phrase to insert into the tree.
	 * @param {string} replacement The replacement text for the phrase.
	 */
	insert = (phrase: string, replacement: string) => {
		const words = phrase.trim().split(" ");
		this.insertRecursive(this.root, words, 0, replacement);
	};

	/**
	 * Adds a phrase to the tree with a replacement, splitting nodes as needed.
	 *
	 * @private
	 *
	 * @param {RadixNode} node The current radix node being examined.
	 * @param {string[]} words The words in the phrase to insert.
	 * @param {number} index The current position in the `words` array.
	 * @param {string} replacement The replacement text for the phrase.
	 */
	private insertRecursive = (
		node: RadixNode,
		words: string[],
		index: number,
		replacement: string
	) => {
		if (index === words.length) {
			// If we've processed all of the words in the phrase, mark the
			// current node as the end of the phrase and store the replacement.
			node.isEndOfWord = true;
			node.replacement = replacement;

			return;
		}

		const firstWord = words[index];
		const remainingWords = words.slice(index);

		for (const [key, child] of node.children) {
			// Check if there's a common prefix between the child's phrase and
			// the remaining words.
			const commonPrefixLength = this.findCommonPrefix(
				child.phrase,
				remainingWords
			);

			// If there's a common prefix, there are three cases.
			if (commonPrefixLength > 0) {
				if (commonPrefixLength === child.phrase.length) {
					// Case 1 - Complete match.

					// The existing node's phrase is completely matched.
					// Continue recursion with the remaining words.
					this.insertRecursive(
						child,
						words,
						index + commonPrefixLength,
						replacement
					);

					return;
				}

				if (commonPrefixLength === remainingWords.length) {
					// Case 2 - The new phrase is shorter.

					// Split the existing node.
					// Create a new node with the remainder of the existing
					// phrase.
					const newNode: RadixNode = {
						phrase: child.phrase.slice(commonPrefixLength),
						children: child.children,
						isEndOfWord: child.isEndOfWord,
						replacement: child.replacement,
					};

					// Update the current node with the new phrase.
					child.phrase = remainingWords;
					child.children = new Map();
					child.children.set(newNode.phrase[0], newNode);
					child.isEndOfWord = true;
					child.replacement = replacement;

					return;
				}

				// Case 3 - Split required.

				// Contains the remainder of the existing phrase.
				const splitNode: RadixNode = {
					phrase: child.phrase.slice(commonPrefixLength),
					children: child.children,
					isEndOfWord: child.isEndOfWord,
					replacement: child.replacement,
				};

				// Contains the remainder of the new phrase.
				const newNode: RadixNode = {
					phrase: remainingWords.slice(commonPrefixLength),
					children: new Map(),
					isEndOfWord: true,
					replacement: replacement,
				};

				// Update the current node to contain only the common prefix.
				child.phrase = remainingWords.slice(0, commonPrefixLength);
				child.children = new Map();
				child.isEndOfWord = false;
				child.replacement = undefined;

				child.children.set(splitNode.phrase[0], splitNode);
				child.children.set(newNode.phrase[0], newNode);

				return;
			}
		}

		// If there is no common prefix found with any existing child, create
		// a new node containing the entire remaining phrase.
		const newNode: RadixNode = {
			phrase: remainingWords,
			children: new Map(),
			isEndOfWord: true,
			replacement: replacement,
		};

		node.children.set(firstWord, newNode);
	};

	/**
	 * Finds the longest matching phrase in the tree given a sequence of words.
	 *
	 * @param {string[]} words The sequence of words to search for.
	 * @param {number} startIndex The position in the `words` array to start searching from.
	 *
	 * @returns {[number, string]|null} Returns either a tuple containing [length of the match, replacement text] or `null` if no match is found.
	 */
	findLongestMatch = (
		words: string[],
		startIndex: number
	): [number, string] | null => {
		return this.findLongestMatchRecursive(this.root, words, startIndex);
	};

	/**
	 * Finds the longest matching phrase in the tree given a sequence of words.
	 *
	 * @private
	 *
	 * @param {RadixNode} node The current node in the radix tree being examined.
	 * @param {string[]} words The sequence of words to search for.
	 * @param {number} index Current position in the `words` array.
	 * @param {number} [matchLength=0] The running total of matched words.
	 *
	 * @returns {[number, string]|null} Returns either a tuple containing [length of the match, replacement text] or `null` if no match is found.
	 */
	private findLongestMatchRecursive = (
		node: RadixNode,
		words: string[],
		index: number,
		matchLength: number = 0
	): [number, string] | null => {
		if (index >= words.length) {
			// If we've reached the end of the input words, check if the
			// current node is marked as an end of phrase. If so, then we can
			// return the replacement text.
			return node.isEndOfWord ? [matchLength, node.replacement!] : null;
		}

		// Stores the best match found so far at the current node level. If
		// the current node is the end of a phrase, it becomes the best match
		// initially.
		let bestMatch: [number, string] | null = node.isEndOfWord
			? [matchLength, node.replacement!]
			: null;

		for (const child of node.children.values()) {
			if (index + child.phrase.length > words.length) {
				// Skip children whose phrases would extend beyond the input
				// array.
				continue;
			}

			let matches = true;

			// Check if the child's phrase matches the words at the current
			// position.
			for (let i = 0; i < child.phrase.length; i++) {
				if (child.phrase[i] !== words[index + i]) {
					matches = false;
					break;
				}
			}

			if (matches) {
				// If the phrase matches, recursively search deeper into the
				// tree, updating the index and match length.
				const match = this.findLongestMatchRecursive(
					child,
					words,
					index + child.phrase.length,
					matchLength + child.phrase.length
				);

				if (match && (!bestMatch || match[0] > bestMatch[0])) {
					// Updates the best match if a longer match is found in
					// the recursive call.
					bestMatch = match;
				}
			}
		}

		return bestMatch;
	};

	/**
	 * Prints the phrases and their replacements, indented by their level in
	 * the tree, starting from the root.
	 */
	print = () => {
		this.printRecursive(this.root, 0);
	};

	/**
	 * Prints the phrases and their replacements, indented by their level in
	 * the tree, starting from the given node.
	 *
	 * @private
	 *
	 * @param {RadixNode} node The node to start printing at.
	 * @param {number} level The level of the node in the tree.
	 */
	private printRecursive = (node: RadixNode, level: number) => {
		// Indent each line by 2 spaces per level.
		const indent = "  ".repeat(level);

		console.log(`${indent}phrase: [${node.phrase.join(" ")}]`);

		if (node.isEndOfWord) {
			// If this node is the end of a phrase, print the replacement
			// since it's a complete phrase.
			console.log(`${indent}replacement: ${node.replacement}`);
		}

		for (const child of node.children.values()) {
			// Recursively print each child node.
			this.printRecursive(child, level + 1);
		}
	};
}
