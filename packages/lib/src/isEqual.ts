/**
 * @license
 * This code is licensed under the terms of the MIT license
 *
 * Copyright (c) 2022 Marco Antonio Anastacio Cintra <anastaciocintra@gmail.com>
 * and contributors:
 * "@bayerlse" - Sebastian Bayerl
 * "@jrson83" -
 * "@bsor-dev"
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */

/**
 * Compare two data objects / arrays in typescript.
 *
 * @author Marco Antonio Anastacio Cintra
 * @link https://gist.github.com/anastaciocintra/6a9bf013d8bd940f857d5c9ad08990e1
 * @param {any} obj1 the first object.
 * @param {any} obj2 the second object.
 * @param {boolean} checkDataOrder determine if order  data is relevant on comparison
 *
 * @returns {boolean} return true if obj1 and obj2 have the same data
 *
 * @example
 *
 * expected results:
 * { a: 1, b: 2 } === { a: 1, b: 2 }
 * { a: 1, b: 2 } === { b: 2, a: 1 }
 * { a: 1, b: 3 } !== { b: 2, a: 1 }
 * [1, 2] === [1, 2]
 * [2, 1] === [1, 2]
 * [1, 3] !== [1, 2]
 *
 * but with checkDataOrder = true, the results are different for arrays:
 * [1, 2] === [1, 2] // same result as without checkDataOrder
 * [2, 1] !== [1, 2] // different order
 * [1, 3] !== [1, 2] // same result as without checkDataOrder
 *
 */
export interface Mismatch {
	/** Location of the mismatch, e.g. `$.content[2].attrs.url`. */
	path: string;
	first: unknown;
	second: unknown;
}

/**
 * The comparison stops at the first difference. When `mismatches` is given,
 * that difference (at its deepest location) is pushed into it, so it receives
 * at most one entry. A property or array element present on only one side is
 * reported with `undefined` for the missing side.
 *
 * When `treatAsEqual` returns true for a pair of values, they are considered
 * equal without further comparison. It is also consulted for a property
 * present on only one side (with `undefined` for the missing side).
 */
export const isEqual = (
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	obj1: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	obj2: any,
	mismatches?: Mismatch[],
	path = "$",
	treatAsEqual?: (first: unknown, second: unknown, path: string) => boolean,
): boolean => {
	const mismatch = (): false => {
		mismatches?.push({ path, first: obj1, second: obj2 });
		return false;
	};

	if (treatAsEqual?.(obj1, obj2, path)) {
		return true;
	}

	if (obj1 === null || obj2 === null || typeof obj1 !== "object" || typeof obj2 !== "object") {
		return obj1 === obj2 || mismatch();
	}

	const isArray = Array.isArray(obj1);
	if (isArray !== Array.isArray(obj2)) {
		return mismatch();
	}

	// Array indices are compared like properties; `length` is implied by them.
	const props = new Set(
		[...Object.getOwnPropertyNames(obj1), ...Object.getOwnPropertyNames(obj2)].filter(
			(prop) => !isArray || prop !== "length",
		),
	);

	for (const prop of props) {
		const childPath = isArray ? `${path}[${prop}]` : `${path}.${prop}`;
		if (!Object.hasOwn(obj1, prop) || !Object.hasOwn(obj2, prop)) {
			if (treatAsEqual?.(obj1[prop], obj2[prop], childPath)) {
				continue;
			}
			mismatches?.push({ path: childPath, first: obj1[prop], second: obj2[prop] });
			return false;
		}
		if (!isEqual(obj1[prop], obj2[prop], mismatches, childPath, treatAsEqual)) {
			return false;
		}
	}
	return true;
};
