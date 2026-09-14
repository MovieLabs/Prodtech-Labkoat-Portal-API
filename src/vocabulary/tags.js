/**
 * Tags: one controlled list of single words, carried by terms and offered view by view.
 *
 * ## Three records, three jobs
 *
 * - **The list** is a facet with `appliesTo: 'tag'` — one store-wide set, edited under Controlled
 *   sets. Each value is `{ tag: <key>, label: { en: <word> }, colour: <swatch> }`. `colour` names a
 *   swatch the editor draws the tag in, the same in every view; which swatches exist is the
 *   editor's decision, so only its shape is checked here.
 * - **A term** carries the keys it has been given in `tag`, with no regard to any view.
 * - **A view** names the keys it offers in `tags`. It decides both which of a term's tags are shown
 *   with it there and which can be given to it there, and it is how one audience's tags stay out of
 *   another's view.
 *
 * ## The key is not the word
 *
 * A key is minted from the word once and then fixed, so correcting a tag's spelling changes what it
 * is called everywhere and strands nothing. Were the word the identity, a rename would be a delete
 * and an add, and the cleanup below would strip the old tag from every term that carried it.
 *
 * ## Removal is lazy
 *
 * Deleting a tag from the list rewrites no term and no view. A view's `tags` are filtered against
 * the list whenever the view is read, and a term's `tag` whenever the term is written, so a removed
 * tag stops being shown at once and leaves the stored records the next time each one is saved.
 *
 * @module vocabulary/tags
 */

/** The one tag list. Named here for the seed; nothing else looks it up by id. */
export const TAG_FACET_ID = 'facet:tag';

/**
 * Every tag key the vocabulary declares.
 *
 * @param {Array<object>} facetDocs
 * @returns {Set<string>}
 */
export const tagKeys = ((facetDocs = []) => new Set(facetDocs
    .filter((facet) => facet.appliesTo === 'tag')
    .flatMap((facet) => (facet.values ?? []).map((value) => value[facet.key]))
    .filter(Boolean)));

/**
 * What each tag is called, by key.
 *
 * @param {Array<object>} facetDocs
 * @param {string} [language='en']
 * @returns {Map<string, string>}
 */
export function tagWords(facetDocs = [], language = 'en') {
    const words = new Map();
    facetDocs
        .filter((facet) => facet.appliesTo === 'tag')
        .forEach((facet) => (facet.values ?? []).forEach((value) => {
            const key = value[facet.key];
            if (key) words.set(key, value.label?.[language] ?? key);
        }));
    return words;
}

/**
 * The tags that still exist, each once, in the order given.
 *
 * @param {*} tags
 * @param {Set<string>} known
 * @returns {string[]}
 */
export const knownOnly = ((tags, known) => [...new Set(
    (Array.isArray(tags) ? tags : []).filter((tag) => known.has(tag)),
)]);

/**
 * A record with one tag field filtered to the tags that still exist.
 *
 * **An emptied list stays, as `[]`.** A term is written over the stored document, so a field left
 * out is a field kept — dropping an empty list here would bring back every tag somebody had just
 * removed.
 *
 * @param {object} doc
 * @param {string} field - `tag` on a term, `tags` on a view
 * @param {Set<string>} known
 * @returns {object}
 */
export function withKnownTags(doc, field, known) {
    if (!doc || doc[field] === undefined) return doc;
    return { ...doc, [field]: knownOnly(doc[field], known) };
}

/**
 * The tags a view shows for a term: those the term carries that the view offers.
 *
 * @param {object} term
 * @param {object} view
 * @returns {string[]}
 */
export function viewTagsOf(term, view) {
    const offered = new Set(view?.tags ?? []);
    return (term?.tag ?? []).filter((tag) => offered.has(tag));
}

/**
 * A key for a new tag, from its word.
 *
 * @param {string} word
 * @param {Set<string>} taken
 * @returns {string}
 */
function mintTagKey(word, taken) {
    const base = String(word).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tag';
    let key = base;
    for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
    return key;
}

/**
 * The tag list, ready to store: each value named by a single word, and a key minted for each new
 * one.
 *
 * A value arriving without a key is new. One arriving with a key keeps it whatever its word now
 * says, which is what makes a rename a rename.
 *
 * @param {Array<object>} values - Already tidied by `normaliseFacet`
 * @param {string} [language='en']
 * @returns {{values: Array<object>, errors: string[]}}
 */
export function prepareTagValues(values = [], language = 'en') {
    const errors = [];
    const taken = new Set(values.map((value) => value.tag).filter(Boolean));
    const words = new Map();
    const keys = new Set();

    const prepared = values.map((value, index) => {
        const word = value.label?.[language] || value.tag || '';
        if (!word) {
            errors.push(`Tag ${index + 1} has no word`);
        } else if (/\s/.test(word)) {
            errors.push(`"${word}" is more than one word. A tag is a single word.`);
        }

        const folded = word.toLowerCase();
        if (word && words.has(folded)) errors.push(`"${word}" is in the list twice`);
        words.set(folded, true);

        const key = value.tag || mintTagKey(word, taken);
        taken.add(key);
        if (keys.has(key)) errors.push(`Two tags share the key "${key}"`);
        keys.add(key);

        const { colour } = value;
        if (colour !== undefined && colour !== null && !/^[a-z][a-z0-9-]*$/.test(String(colour))) {
            errors.push(`"${word}" has a colour that is not a swatch name`);
        }

        return { tag: key, label: { ...value.label, [language]: word }, ...(colour ? { colour } : {}) };
    });

    return { values: prepared, errors };
}
