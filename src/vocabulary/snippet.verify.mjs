/**
 * Runnable check that a term renders as the line a document expects.
 *
 * `node src/vocabulary/snippet.verify.mjs`
 *
 * The renderer is a pure function over a term document, so the cases that matter — a label
 * carrying markdown, a definition written across two lines, no definition at all — can be checked
 * without a database or a running service.
 *
 * Throws on failure; prints a summary on success. There is no test runner in this repo.
 */

import { hasDefinition, termSnippet } from './snippet.js';

let checked = 0;

/**
 * @param {string} what
 * @param {*} got
 * @param {*} wanted
 */
function is(what, got, wanted) {
    if (got !== wanted) {
        throw new Error(`${what}\n  got:    ${JSON.stringify(got)}\n  wanted: ${JSON.stringify(wanted)}`);
    }
    checked += 1;
}

/** A term document in the shape the store holds. */
const term = ((labels, definition) => ({
    _id: 'vmc:c-000001',
    label: labels,
    ...(definition === undefined ? {} : { definition }),
}));

const pref = ((value) => [{ value, language: 'en', labelType: 'pref' }]);

// ---- the ordinary case ----

is(
    'a term with a label and a definition',
    termSnippet(term(pref('Asset'), { en: 'A physical or digital object.' })),
    '**Asset**: A physical or digital object.',
);

// ---- always the preferred label ----

is(
    'the preferred label wins over every other type',
    termSnippet(term(
        [
            { value: 'asset', language: 'en', labelType: 'omcToken' },
            { value: 'Asset', language: 'en', labelType: 'pref' },
            { value: 'Thing', language: 'en', labelType: 'synonym' },
        ],
        { en: 'A physical or digital object.' },
    )),
    '**Asset**: A physical or digital object.',
);

// ---- one line, always ----

is(
    'a definition written across lines is collapsed',
    termSnippet(term(pref('Sequence'), { en: 'An ordered collection\n  of media used\n\nto organize.' })),
    '**Sequence**: An ordered collection of media used to organize.',
);

is(
    'surrounding whitespace is trimmed',
    termSnippet(term(pref('Shot'), { en: '   A single take.   ' })),
    '**Shot**: A single take.',
);

// ---- the label is escaped, the definition is not ----

is(
    'a label carrying emphasis markers cannot break the bold',
    termSnippet(term(pref('5.1*EX_2'), { en: 'A channel layout.' })),
    '**5.1\\*EX\\_2**: A channel layout.',
);

is(
    'a definition keeps the markdown its author wrote',
    termSnippet(term(pref('Camera'), { en: 'See *Lens* for the optics.' })),
    '**Camera**: See *Lens* for the optics.',
);

// ---- no definition is a real state, not an error ----

is(
    'a term with no definition renders its label and the colon',
    termSnippet(term(pref('Anamorphic'), {})),
    '**Anamorphic**:',
);

is(
    'a term with no definition field at all does the same',
    termSnippet(term(pref('Anamorphic'), undefined)),
    '**Anamorphic**:',
);

is(
    'an empty definition string counts as no definition',
    termSnippet(term(pref('Anamorphic'), { en: '   ' })),
    '**Anamorphic**:',
);

// ---- and the caller can tell which those were ----

is('hasDefinition is true when there is one', hasDefinition(term(pref('Asset'), { en: 'A thing.' })), true);
is('hasDefinition is false when there is none', hasDefinition(term(pref('Asset'), {})), false);
is('hasDefinition is false for whitespace', hasDefinition(term(pref('Asset'), { en: '\n ' })), false);

console.log(`snippet.verify: ${checked} checks passed`);
