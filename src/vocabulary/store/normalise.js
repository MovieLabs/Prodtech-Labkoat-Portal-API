/**
 * Tidy what somebody typed, before it is validated or stored.
 *
 * Text arrives from a form, and a form collects what the pointer left behind: a trailing space from
 * a double-click that selected the word and the space after it, a carriage return from a value
 * pasted out of a spreadsheet, a newline from one pasted out of a document.
 *
 * None of it is visible, and all of it is load-bearing somewhere downstream. `"Wild Track "` and
 * `"Wild Track"` are two different labels to the duplicate check, sort either side of each other,
 * and match nothing when a schema looks one up. A carriage return inside a value breaks a CSV row in
 * a way that only shows up in whatever opens the file.
 *
 * **Here rather than in the form**, because it has to hold for every writer: the editor, a build
 * script posting a term, and whatever comes next. A client may tidy as well, for the person typing;
 * it cannot be the only place it happens.
 *
 * @module vocabulary/store/normalise
 */

/**
 * A value that belongs on one line: a label, a type, a tag.
 *
 * Every run of whitespace — including a newline that should not be there at all — becomes a single
 * space, and the ends are trimmed. A label spanning two lines is a paste accident every time.
 *
 * @param {*} value
 * @returns {*} Unchanged if it is not a string
 */
export function oneLine(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/\s+/g, ' ').trim();
}

/**
 * A value that may legitimately run to several lines: a definition, a note.
 *
 * Line endings are normalised and the ends trimmed; the shape in between is left alone, because a
 * definition written as two paragraphs was written that way on purpose.
 *
 * @param {*} value
 * @returns {*} Unchanged if it is not a string
 */
export function manyLines(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(/\r\n?/g, '\n')
        // Trailing spaces before a line break are invisible and survive every diff.
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

/**
 * Every value of a multilingual field, tidied.
 *
 * @param {object} field - e.g. `{ en: '...' }`
 * @param {function(*): *} how
 * @returns {object}
 */
const localisedField = ((field, how) => (field && typeof field === 'object'
    ? Object.fromEntries(Object.entries(field).map(([language, value]) => [language, how(value)]))
    : field));

/**
 * A term, ready to validate.
 *
 * Labels are one line each; definitions and notes may run to several. Examples are one line when
 * they are a URL and may not be when they are prose, so they are treated as prose — trimming is the
 * part that matters and collapsing would be a guess.
 *
 * @param {object} term
 * @returns {object}
 */
export function normaliseTerm(term) {
    if (!term || typeof term !== 'object') return term;

    return {
        ...term,
        ...(term.label
            ? {
                label: term.label.map((entry) => ({
                    ...entry,
                    value: oneLine(entry.value),
                    labelType: oneLine(entry.labelType),
                })),
            }
            : {}),
        ...(term.definition ? { definition: localisedField(term.definition, manyLines) } : {}),
        ...(term.note
            ? {
                note: term.note.map((entry) => ({
                    ...entry,
                    value: manyLines(entry.value),
                    noteType: oneLine(entry.noteType),
                })),
            }
            : {}),
        ...(term.example
            ? {
                example: term.example.map((entry) => ({
                    ...entry,
                    value: manyLines(entry.value),
                    exampleType: oneLine(entry.exampleType),
                })),
            }
            : {}),
        ...(term.status ? { status: oneLine(term.status) } : {}),
        ...(term.arrangementName ? { arrangementName: oneLine(term.arrangementName) } : {}),
    };
}

/**
 * A view, ready to validate.
 *
 * @param {object} view
 * @returns {object}
 */
export function normaliseView(view) {
    if (!view || typeof view !== 'object') return view;

    return {
        ...view,
        ...(view.label
            ? {
                label: view.label.map((entry) => ({ ...entry, value: oneLine(entry.value) })),
            }
            : {}),
        ...(view.definition ? { definition: localisedField(view.definition, manyLines) } : {}),
        ...(view.ontology ? { ontology: oneLine(view.ontology) } : {}),
        ...(view.filename ? { filename: oneLine(view.filename) } : {}),
        ...(view.labelType ? { labelType: oneLine(view.labelType) } : {}),
    };
}

/**
 * A controlled set, ready to validate.
 *
 * The value itself matters most: a type carrying a trailing space matches nothing that asks for it,
 * and the term editor then offers a kind no export can find.
 *
 * @param {object} facet
 * @returns {object}
 */
export function normaliseFacet(facet) {
    if (!facet || typeof facet !== 'object' || !Array.isArray(facet.values)) return facet;

    return {
        ...facet,
        values: facet.values.map((value) => ({
            ...value,
            ...(facet.key && typeof value[facet.key] === 'string'
                ? { [facet.key]: oneLine(value[facet.key]) }
                : {}),
            ...(value.label ? { label: localisedField(value.label, oneLine) } : {}),
            ...(typeof value.skos === 'string' ? { skos: oneLine(value.skos) } : {}),
        })),
    };
}
