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

import { PROFILE_KINDS, profileKindOf } from '../exportProfiles.js';
import { fieldCatalogue } from '../fields.js';

import { listFacets } from './read.js';

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok - False when an error was found
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * The predicates a label, note or example type may project to.
 *
 * Fixed, because these are the ones SKOS defines for labelling and documentation — the standard's
 * vocabulary, not this project's. A triple naming an invented predicate is a document a validator
 * rejects and nobody reads twice.
 *
 * Served to clients over `/export/fields` rather than restated in each of them; the Portal's facet
 * editor carried its own copy of this list.
 *
 * @type {string[]}
 */
export const SKOS_PREDICATES = [
    'skos:prefLabel',
    'skos:altLabel',
    'skos:hiddenLabel',
    'skos:definition',
    'skos:note',
    'skos:editorialNote',
    'skos:scopeNote',
    'skos:historyNote',
    'skos:changeNote',
    'skos:example',
];

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

    checkArrangement(term, found);

    return found;
}

/**
 * Check a member list — a term's arrangement, or a view's own.
 *
 * The same rules either way, which is the point of both holding members in one shape: there is one
 * thing to check, and a row means the same wherever it sits.
 *
 * @param {Array<object>} members
 * @param {ValidationResult} found - Accumulated into
 * @param {string} where - Named in the messages, e.g. "this arrangement"
 */
function validateMembers(members, found, where) {
    const mids = new Set();

    members.forEach((member) => {
        if (!member.mid) fail(found, 'Every member needs a member id');
        if (mids.has(member.mid)) fail(found, `Duplicate member id "${member.mid}"`);
        mids.add(member.mid);

        if (!member.term) fail(found, `Member "${member.mid}" names no term`);

        // Which arrangement this placement brings. Absent is the term's default; `none` takes its
        // children from the rows around it instead; anything else names one of the term's forks.
        //
        // **Whether that fork exists is not checked here**, and deliberately: it is a fact about
        // another document, so a write would have to read the term to answer it and would still race
        // anyone deleting the fork. The resolver reports it instead, in `missingArrangements`, where
        // every arrangement is already in hand. What is checked is the shape.
        if (member.arrangement !== undefined && typeof member.arrangement !== 'string') {
            fail(found, `Member "${member.mid}" names an arrangement that is not a string`);
        }
    });

    // A parent outside the list would break the walk that derives dotted labels and the
    // broader/narrower projection, and it would do it at read time, far from the write that
    // caused it.
    members.forEach((member) => {
        if (member.parent && !mids.has(member.parent)) {
            fail(found, `Member "${member.mid}" has a parent "${member.parent}" that is not in ${where}`);
        }
    });

    // A parent chain that loops makes the resolver hang rather than fail, which is the worst way
    // for this to go wrong.
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
}

/**
 * Check the arrangement a term carries.
 *
 * Called as part of checking the term: an arrangement is a property of a term, so there is no
 * separate record to validate on its own.
 *
 * @param {object} term
 * @param {ValidationResult} found - Accumulated into
 */
function checkArrangement(term, found) {
    // A term whose arrangement reaches itself, directly. Indirect cycles need every arrangement in
    // hand to check, so those are caught at resolve time and reported there — this catches the
    // common case cheaply, at the write that caused it.
    const checkRows = ((rows, where) => {
        validateMembers(rows, found, where);
        rows.forEach((member) => {
            if (member.term === term._id) fail(found, `A term cannot be placed inside ${where}`);
        });
    });

    if (term?.member !== undefined) {
        if (!Array.isArray(term.member)) {
            fail(found, 'An arrangement must be a list of members');
        } else {
            checkRows(term.member, 'its own arrangement');
        }
    }

    if (term?.arrangementName !== undefined
        && (typeof term.arrangementName !== 'string' || !term.arrangementName.trim())) {
        fail(found, 'An arrangement name must be a non-empty string');
    }

    if (term?.fork === undefined) return; // No forks, which is most terms
    if (!Array.isArray(term.fork)) {
        fail(found, 'The forks of a term must be a list');
        return;
    }

    // **A fork id is what a placement points at**, so it has to exist and be unique within the term
    // — the container id is built from it, and two forks answering to one id would put a row's
    // children in whichever was found first.
    const ids = new Set();
    term.fork.forEach((fork) => {
        if (!fork?.id) {
            fail(found, 'Every fork needs an id');
            return;
        }
        if (ids.has(fork.id)) fail(found, `Duplicate fork id "${fork.id}"`);
        ids.add(fork.id);

        // Named, because the palette lists a term's forks together and they are otherwise
        // indistinguishable — which is the whole reason a fork carries a name at all.
        if (!fork.name || !String(fork.name).trim()) {
            fail(found, `Fork "${fork.id}" needs a name`);
        }

        if (fork.member !== undefined && !Array.isArray(fork.member)) {
            fail(found, `Fork "${fork.id}" must hold a list of members`);
            return;
        }
        checkRows(fork.member ?? [], `fork "${fork.name ?? fork.id}"`);
    });
}

/**
 * Check the shape of a view's `arrange` block.
 *
 * **Shape only, and that is the whole design.** Whether `vmc:c-000041/m7` names a placement this
 * view actually reaches depends on every arrangement the view gathers, which is not in hand here and
 * changes without this view being written to. So it is reported at resolve time, in `problems` — the
 * same split `checkArrangement` already makes for indirect cycles.
 *
 * What is worth refusing here is a key that could never name anything, because that is a typo rather
 * than a stale reference and it would otherwise fail silently — a view that hides nothing looks
 * exactly like a view whose hide list is misspelt.
 *
 * @param {object} view
 * @param {ValidationResult} found - Accumulated into
 */
function checkArrange(view, found) {
    const arrange = view?.arrange;
    if (!arrange) return;

    // Exactly one slash, with something either side. A term id carries a colon and never a slash,
    // and a mid is `m` followed by digits, so this is the whole of the rule.
    const wellFormed = ((key) => {
        if (typeof key !== 'string') return false;
        const parts = key.split('/');
        return parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]);
    });

    // Both lists name placements the same way, and neither can be checked further than its shape.
    [['hide', arrange.hide], ['dotFrom', arrange.dotFrom]].forEach(([name, list]) => {
        if (list === undefined) return;
        if (!Array.isArray(list)) {
            fail(found, `arrange.${name} must be a list of placement keys`);
            return;
        }
        list.forEach((key) => {
            if (!wellFormed(key)) {
                fail(found, `"${key}" is not a placement key — it must read containerId/memberId, e.g. vmc:c-000041/m7`);
            }
        });
    });
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
    // A view **is** the root. What it publishes is what is attached to it, in the same member shape
    // a term's arrangement uses — so a view attaches a plain term and an arranged one alike.
    if (view?.member !== undefined && !Array.isArray(view.member)) {
        fail(found, 'A view’s member list must be a list');
    } else {
        validateMembers(view?.member ?? [], found, 'this view');
    }

    if (view?.labelStyle && !['plain', 'dotted'].includes(view.labelStyle)) {
        fail(found, 'labelStyle must be plain or dotted');
    }

    // How wide the editor draws a pill for this view. Bounded rather than free: below about 120 a
    // pill cannot hold a word, and past 800 one node fills the canvas — both are ways of making the
    // graph unusable by typing a number into a form.
    if (view?.nodeWidth !== undefined && view.nodeWidth !== null) {
        const width = Number(view.nodeWidth);
        if (!Number.isFinite(width) || width < 120 || width > 800) {
            fail(found, 'nodeWidth must be a number between 120 and 800');
        }
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

    checkArrange(view, found);

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
 * What reverting an arrangement would cost.
 *
 * Nothing is deleted and nothing stops resolving — the term stays, and so does every placement of
 * it. What changes is that its members go back to being local to one container, so **every other
 * placement of the term loses them**. That is a consequence worth reading before it happens, and it
 * is a warning rather than a refusal because it is exactly what the reader asked for.
 *
 * @param {object} usage - From `termUsage`
 * @param {string} keepingIn - The container the members are going back to
 * @returns {ValidationResult}
 */
export function checkArrangementRemoval(usage, keepingIn) {
    const found = result();

    const elsewhere = [
        ...(usage?.collections ?? []),
        ...(usage?.views ?? []),
    ].map((one) => one._id).filter((id) => id !== keepingIn);

    if (elsewhere.length) {
        found.warnings.push(
            `The term is also placed in ${elsewhere.join(', ')}. `
            + `Those placements will lose what is under it, which stays in ${keepingIn}.`,
        );
    }
    return found;
}

/**
 * What a view may publish a format under.
 *
 * A profile decides what reaches the output, so a mistake here is not a broken export — it is a
 * quiet one. A column naming a source that does not exist produces a blank column under a heading
 * that promises content, which reads as the vocabulary being empty rather than the profile being
 * wrong. So an unknown source is named and refused.
 *
 * Two things are deliberately *not* refused. A profile may drop a label type from SKOS, because
 * that is the decision it exists to record. And it may leave every scalar unset, because the
 * defaults are what an unconfigured view already publishes.
 *
 * @param {object} profile
 * @param {string} format
 * @param {Array<object>} facetDocs - Facet documents, for the field catalogue and the type names
 * @returns {ValidationResult}
 */
export function validateExportProfile(profile, format, facetDocs) {
    const found = result();
    const kind = profileKindOf(format);

    if (!PROFILE_KINDS.includes(kind)) {
        fail(found, `"${format}" is not a format a profile can be written for. Use one of: ${PROFILE_KINDS.join(', ')}`);
        return found;
    }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        fail(found, 'A profile must be an object');
        return found;
    }

    if (kind === 'skos') {
        validateSkosProfile(profile, facetDocs, found);
        return found;
    }
    if (kind === 'json') {
        if (profile.include !== undefined && !Array.isArray(profile.include)) {
            fail(found, 'include must be a list');
        }
        return found;
    }

    validateTabularProfile(profile, facetDocs, found);
    return found;
}

/**
 * A SKOS profile remaps or drops a type. It cannot invent one.
 *
 * @param {object} profile
 * @param {Array<object>} facetDocs
 * @param {ValidationResult} found
 * @returns {void}
 */
function validateSkosProfile(profile, facetDocs, found) {
    const targets = { labels: 'label', notes: 'note', examples: 'example' };

    Object.entries(targets).forEach(([key, appliesTo]) => {
        const overrides = profile[key];
        if (overrides === undefined) return;
        if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
            fail(found, `${key} must be a map of type to predicate`);
            return;
        }

        const known = new Set(facetDocs
            .filter((facet) => facet.appliesTo === appliesTo)
            .flatMap((facet) => (facet.values ?? []).map((value) => value[facet.key])));

        Object.entries(overrides).forEach(([type, predicate]) => {
            if (known.size && !known.has(type)) {
                fail(found, `"${type}" is not a known ${appliesTo} type, so this view cannot say where it projects. Add it to the controlled set first.`);
            }
            // `null` is the whole point: it says this view does not publish that type. Anything else
            // has to be a predicate SKOS actually defines, because a triple naming an invented one
            // is a document a validator rejects and nobody reads twice.
            if (predicate !== null && !SKOS_PREDICATES.includes(predicate)) {
                fail(found, `"${predicate}" is not a SKOS predicate. Use one of: ${SKOS_PREDICATES.join(', ')}, or null to leave ${type} out of this view.`);
            }
        });
    });
}

/**
 * A tabular profile is a list of columns and how to write them out.
 *
 * @param {object} profile
 * @param {Array<object>} facetDocs
 * @param {ValidationResult} found
 * @returns {void}
 */
function validateTabularProfile(profile, facetDocs, found) {
    if (profile.rows !== undefined && !['term', 'placement'].includes(profile.rows)) {
        fail(found, 'rows must be term or placement');
    }
    if (profile.split !== undefined && !['none', 'per-scheme'].includes(profile.split)) {
        fail(found, 'split must be none or per-scheme');
    }

    if (profile.columns === undefined) return;
    if (!Array.isArray(profile.columns) || !profile.columns.length) {
        // A profile with no columns publishes a file of nothing, which is never what was meant and
        // is indistinguishable from an empty vocabulary once it has been downloaded.
        fail(found, 'A profile must keep at least one column');
        return;
    }

    const sources = new Set(fieldCatalogue(facetDocs).map((entry) => entry.source));
    const headers = new Set();

    profile.columns.forEach((column, index) => {
        const where = `Column ${index + 1}`;
        if (!column?.source) {
            fail(found, `${where} names no source`);
        } else if (!sources.has(column.source)) {
            fail(found, `${where}: "${column.source}" is not something this vocabulary can publish. It may name a type that has since been removed from its controlled set.`);
        }

        const header = String(column?.header ?? '').trim();
        if (!header) fail(found, `${where} has no heading`);
        // Two columns under one heading is a spreadsheet nobody can read and a CSV whose second
        // column is silently the one that survives a re-import.
        else if (headers.has(header)) fail(found, `Two columns are both headed "${header}"`);
        else headers.add(header);
    });
}
