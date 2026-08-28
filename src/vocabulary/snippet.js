/**
 * A term as a line of markdown, for a build script to paste into a document.
 *
 * A document carries a recognisable marker naming a term identifier; a script replaces each marker
 * with what this produces, so a definition written once in the vocabulary reaches every document
 * that cites it.
 *
 * ## Always the preferred label
 *
 * Not the label type a view publishes. A snippet is a statement about the **term**, and the term is
 * the same one whichever view a reader arrives from — a document citing `vmc:c-000034` means Asset,
 * not whatever a particular view happens to call it. That is also why nothing here takes a view.
 *
 * ## One line, always
 *
 * The output replaces a marker inside a sentence or a list item, so it cannot contain newlines: a
 * definition written across two lines would break the block it lands in. Whitespace runs are
 * collapsed to single spaces.
 *
 * ## The label is escaped, the definition is not
 *
 * The label sits inside `**…**`, so a `*` or `_` in it would close the emphasis early and corrupt
 * the rest of the line — silently, in a generated document nobody re-reads. The definition is prose
 * an author wrote and may have meant to contain markdown, so it is passed through as it stands.
 *
 * @module vocabulary/snippet
 */

import { DEFAULT_LANGUAGE, localised, prefLabel } from './store/read.js';

/** Characters that would end the emphasis, or start something else, inside `**…**`. */
const ESCAPE = /([\\`*_[\]])/g;

/**
 * Make a string safe to sit inside markdown emphasis.
 *
 * @param {string} text
 * @returns {string}
 */
const escapeMarkdown = ((text) => String(text ?? '').replace(ESCAPE, '\\$1'));

/**
 * Collapse a value onto one line.
 *
 * @param {string} text
 * @returns {string}
 */
const oneLine = ((text) => String(text ?? '').replace(/\s+/g, ' ').trim());

/**
 * One term, rendered as `**Label**: Definition`.
 *
 * A term with no definition returns the label and the colon, so the document still names the term
 * and the gap is visible rather than the whole line disappearing. The caller is told which terms
 * those were — see the batch route — so a build can decide whether that is acceptable.
 *
 * @param {object} term - The term document, as stored
 * @param {string} [language]
 * @returns {string}
 */
export function termSnippet(term, language = DEFAULT_LANGUAGE) {
    const label = escapeMarkdown(oneLine(prefLabel(term, language)));
    const definition = oneLine(localised(term.definition, language));
    return definition ? `**${label}**: ${definition}` : `**${label}**:`;
}

/**
 * Whether a term carries a definition in this language.
 *
 * Asked separately from rendering, because "no definition" is a real state a build may want to fail
 * on and the rendered line cannot be tested for it — a definition could legitimately be any text.
 *
 * @param {object} term
 * @param {string} [language]
 * @returns {boolean}
 */
export const hasDefinition = ((term, language = DEFAULT_LANGUAGE) => (
    Boolean(oneLine(localised(term?.definition, language)))
));
