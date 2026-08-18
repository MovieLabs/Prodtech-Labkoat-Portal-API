/**
 * What a term, collection or view must satisfy before it is written.
 *
 * ## Why this is a module and not a few `if`s at the call site
 *
 * The old store enforced almost nothing, and the failures that produced were not loud ones. A
 * duplicate id silently overwrote, because the write was a `MERGE`. An edge to a node that was never
 * created matched nothing and returned success. A scheme missing its label node voided every
 * membership in it on the next reload. In each case the write was accepted and something was quietly
 * wrong afterwards.
 *
 * So every rule here is a rule some past bug would have been caught by, and validation runs before
 * anything is written rather than being spread through the code that writes it.
 *
 * ## Errors and warnings are different
 *
 * An **error** refuses the write. A **warning** allows it and says something. Deleting a term that
 * three collections use is not obviously wrong — it may be exactly what was meant — but it must not
 * happen without the caller being told what it costs.
 *
 * @module vocabulary/store/validate
 */

import { listFacets } from './read.js';

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok - False when an error was found
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/** An empty result to accumulate into. */
const result = (() => ({ ok: true, errors: [], warnings: [] }));

const fail = ((into, message) => {
    into.errors.push(message);
    into.ok = false;
});

/**
 * The allowed values for each faceted field, from the facets as stored.
 *
 * Read rather than hardcoded: the whole point of holding the lists in `vocab_facets` is that an
 * editor can add "trade name" as a kind of label without a deploy. A validator with its own copy
 * would refuse the value the editor just created.
 *
 * @returns {Promise<Map<string, Set<string>>>} `appliesTo` → allowed values
 */
export async function allowedFacetValues() {
    const facets = await listFacets();
    const allowed = new Map();
    facets.forEach((facet) => {
        const values = new Set((facet.values ?? []).map((value) => value[facet.key]));
        // Several facets may target the same field — a view can tag from more than one scheme — so
        // the sets union rather than replace.
        const existing = allowed.get(facet.appliesTo) ?? new Set();
        values.forEach((value) => existing.add(value));
        allowed.set(facet.appliesTo, existing);
    });
    return allowed;
}

/**
 * Check a term.
 *
 * @param {object} term - The document as it would be stored
 * @param {Map<string, Set<string>>} allowed - From `allowedFacetValues`
 * @returns {ValidationResult}
 */
export function validateTerm(term, allowed) {
    const found = result();

    if (!term?._id) fail(found, 'A term must have an identifier');

    const labels = term?.label ?? [];
    if (!labels.length) {
        fail(found, 'A term must have at least one label — a term with no name cannot be used or found');
    }

    // The invariant that pays for collapsing prefLabel into the label array. Exactly one preferred
    // label per language: none and the term has no name in that language, two and every consumer
    // has to guess which one is meant, including the SKOS export, where `skos:prefLabel` is
    // specified as at most one per language.
    const prefByLanguage = new Map();
    labels.forEach((label) => {
        if (!label.value) fail(found, 'A label must have a value');
        if (!label.labelType) fail(found, `Label "${label.value}" must say what kind of label it is`);
        if (label.labelType === 'pref') {
            const language = label.language ?? 'en';
            prefByLanguage.set(language, (prefByLanguage.get(language) ?? 0) + 1);
        }
    });

    if (!prefByLanguage.size) {
        fail(found, 'A term must have a preferred label');
    }
    prefByLanguage.forEach((count, language) => {
        if (count > 1) {
            fail(found, `A term may have only one preferred label per language — found ${count} in "${language}"`);
        }
    });

    // Types are controlled, never free text. This is what stops a vocabulary accumulating
    // "abbrevation" beside "abbreviation" and quietly splitting into two.
    const checkTypes = ((entries, field, key) => {
        const permitted = allowed.get(field);
        (entries ?? []).forEach((entry) => {
            const value = entry[key];
            if (value && permitted && !permitted.has(value)) {
                fail(found, `"${value}" is not a known ${key}. Add it to the facet first, or use one of: ${[...permitted].join(', ')}`);
            }
        });
    });

    checkTypes(labels, 'label', 'labelType');
    checkTypes(term?.note, 'note', 'noteType');
    checkTypes(term?.example, 'example', 'exampleType');

    return found;
}

/**
 * Check a collection.
 *
 * @param {object} collection
 * @returns {ValidationResult}
 */
export function validateCollection(collection) {
    const found = result();

    if (!collection?._id) fail(found, 'A collection must have an identifier');
    if (!(collection?.label ?? []).some((label) => label.labelType === 'pref')) {
        fail(found, 'A collection must have a preferred label');
    }

    const validProjections = ['conceptScheme', 'collection', 'transparent'];
    if (collection?.skosAs && !validProjections.includes(collection.skosAs)) {
        fail(found, `skosAs must be one of ${validProjections.join(', ')}`);
    }

    const members = collection?.member ?? [];
    const mids = new Set();

    members.forEach((member) => {
        if (!member.mid) fail(found, 'Every member needs a member id');
        if (mids.has(member.mid)) fail(found, `Duplicate member id "${member.mid}"`);
        mids.add(member.mid);

        if (!member.term && !member.collection) {
            fail(found, `Member "${member.mid}" names neither a term nor a collection`);
        }
        if (member.term && member.collection) {
            fail(found, `Member "${member.mid}" names both a term and a collection — it must be one`);
        }
    });

    // A parent outside the collection would break the walk that derives dotted labels and the
    // broader/narrower projection, and it would do it at read time, far from the write that caused it.
    members.forEach((member) => {
        if (member.parent && !mids.has(member.parent)) {
            fail(found, `Member "${member.mid}" has a parent "${member.parent}" that is not in this collection`);
        }
    });

    // A parent chain that loops makes the resolver hang rather than fail, which is the worst way for
    // this to go wrong.
    const parentOf = new Map(members.map((member) => [member.mid, member.parent]));
    members.forEach((member) => {
        const seen = new Set();
        let at = member.mid;
        while (at) {
            if (seen.has(at)) {
                fail(found, `Member "${member.mid}" is its own ancestor`);
                return;
            }
            seen.add(at);
            at = parentOf.get(at) ?? null;
        }
    });

    // A collection that includes itself, directly. Indirect cycles need every collection to check,
    // so they are caught at resolve time and reported there — this catches the common case cheaply.
    members.forEach((member) => {
        if (member.collection === collection._id) {
            fail(found, 'A collection cannot include itself');
        }
    });

    return found;
}

/**
 * Check a view.
 *
 * @param {object} view
 * @param {Map<string, Set<string>>} allowed
 * @returns {ValidationResult}
 */
export function validateView(view, allowed) {
    const found = result();

    if (!view?._id) fail(found, 'A view must have an identifier');
    if (!view?.root) fail(found, 'A view must name the collection it publishes');

    if (view?.labelStyle && !['plain', 'dotted'].includes(view.labelStyle)) {
        fail(found, 'labelStyle must be plain or dotted');
    }

    // Which kind of name this view publishes. Controlled for the same reason a term's label types
    // are: a view asking for `omcTokn` renders every name from the preferred-label fallback and
    // looks like it worked, because a substituted name is a name.
    const permittedLabels = allowed.get('label');
    if (view?.labelType && permittedLabels && !permittedLabels.has(view.labelType)) {
        fail(found, `"${view.labelType}" is not a known label type. Use one of: ${[...permittedLabels].join(', ')}`);
    }

    // Tags are controlled for the reason the brief gave: an unmanaged tag set accumulates
    // misspellings, and two spellings of one designation split the thing they were meant to group.
    const permittedTags = allowed.get('tag');
    Object.entries(view?.tag ?? {}).forEach(([termId, tags]) => {
        (tags ?? []).forEach((tag) => {
            if (permittedTags && !permittedTags.has(tag)) {
                fail(found, `"${tag}" on ${termId} is not a known tag. Add it to a tag facet first.`);
            }
        });
    });

    return found;
}

/**
 * What deleting a term would cost.
 *
 * Not an error. A term used in three collections may well be one somebody means to remove — but not
 * without being told, and not without the collections being cleaned up, which the caller does.
 *
 * @param {object} usage - From `termUsage`
 * @returns {ValidationResult}
 */
export function checkTermDeletion(usage) {
    const found = result();
    const count = usage?.collections?.length ?? 0;
    if (count) {
        found.warnings.push(
            `This term is placed in ${count} collection${count === 1 ? '' : 's'}: `
            + `${usage.collections.map((collection) => collection._id).join(', ')}. `
            + 'Those placements will be removed with it.',
        );
    }
    return found;
}

/**
 * What deleting a collection would cost.
 *
 * @param {object} usage - From `collectionUsage`
 * @returns {ValidationResult}
 */
export function checkCollectionDeletion(usage) {
    const found = result();

    // A view rooted on a collection that no longer exists resolves to nothing, and says so only
    // when somebody next opens it. That is an error rather than a warning.
    if (usage?.views?.length) {
        fail(found, `${usage.views.length} view(s) publish this collection: `
        + `${usage.views.map((view) => view._id).join(', ')}. Repoint or delete them first.`);
    }
    if (usage?.collections?.length) {
        found.warnings.push(
            `${usage.collections.length} collection(s) include this one: `
            + `${usage.collections.map((collection) => collection._id).join(', ')}. `
            + 'Those inclusions will stop resolving.',
        );
    }
    return found;
}
