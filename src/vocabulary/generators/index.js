/**
 * The generators, and the one call that runs any of them.
 *
 * A generator turns a resolved view into an artifact for a particular consumer. They live here
 * rather than behind route handlers for three reasons the design settled on: they read Mongo
 * directly rather than through the API layer, they can therefore run from a build script with no
 * service in the path, and a new format is a module rather than a deploy of the gateway's routing.
 *
 * Adding one means adding an entry to `GENERATORS`. Nothing else changes.
 *
 * @module vocabulary/generators
 */

import { profileFor, projectionsWithOverrides } from '../exportProfiles.js';
import { resolveView } from '../resolve.js';
import { skosProjectionIndex } from '../store/facetSeeds.js';
import { listFacets } from '../store/read.js';

import { toCsv } from './csv.js';
import { toViewJson } from './json.js';
import { toMarkdown } from './markdown.js';
import { skosTriples, toJsonLd, toTurtle } from './skos.js';
import { toXlsx } from './xlsx.js';

/**
 * @typedef {object} Artifact
 * @property {string|object|Buffer} body
 * @property {string} contentType
 * @property {string} extension
 * @property {string} filename - What the artifact should be saved as, extension included
 * @property {object} [problems] - Anything the generator could not express, stated rather than hidden
 */

/**
 * What an artifact should be called.
 *
 * Named here rather than by the caller because the extension is the generator's to decide and a
 * caller cannot know it — a format that splits its output ships a zip, whatever format was asked
 * for. The browser reads this off `Content-Disposition`.
 *
 * @param {string} viewId
 * @param {string} extension
 * @returns {string}
 */
const filenameFor = ((viewId, extension) => `${viewId.replace(/^view:/, '')}.${extension}`);

/**
 * Every format, by name.
 *
 * `internal` is the resolution itself — the shape this service works in. It is offered because it is
 * occasionally what you want when debugging, and named `internal` rather than `json` precisely so
 * that no consumer mistakes it for a contract. `json` is the shaped document consumers should read.
 *
 * `label` lives here rather than in a client because it is a fact about the format, and a format
 * added to this registry should reach every consumer with no change anywhere else.
 *
 * `run` takes one context — `{ resolution, projections, profile, facets }` — and may be
 * asynchronous. It returns a body, or `{ body, problems }`, and may override `contentType` and
 * `extension` where what it produces is not what the registry entry says (a split export is a zip).
 *
 * @type {Object<string, {label: string, contentType: string, extension: string, run: Function}>}
 */
const GENERATORS = {
    'internal': {
        label: 'Internal (resolution)',
        contentType: 'application/json',
        extension: 'json',
        run: ({ resolution }) => ({
            view: resolution.view,
            status: resolution.status,
            placements: resolution.placements,
            // What `arrange.hide` left out. Only this format carries them: an editor showing what a
            // view publishes has to draw the headings it does not, or there is no way to see what
            // was left out and no way to put it back.
            suppressed: resolution.suppressed,
            // Every term the view reaches, arrangements included — a term carrying `member` is
            // what used to be a separate collection document, so one map holds both.
            terms: Object.fromEntries(resolution.terms),
            problems: resolution.problems,
        }),
    },
    'json': {
        label: 'JSON',
        contentType: 'application/json',
        extension: 'json',
        run: ({ resolution, profile }) => toViewJson(resolution, profile),
    },
    'csv': {
        label: 'CSV',
        contentType: 'text/csv',
        extension: 'csv',
        run: ({ resolution, profile, facets }) => toCsv(resolution, profile, facets),
    },
    'xlsx': {
        label: 'Excel (XLSX)',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
        run: ({ resolution, profile, facets }) => toXlsx(resolution, profile, facets),
    },
    'markdown': {
        label: 'Markdown',
        contentType: 'text/markdown',
        extension: 'md',
        run: ({ resolution, profile, facets }) => toMarkdown(resolution, profile, facets),
    },
    'skos-ttl': {
        label: 'SKOS (Turtle)',
        contentType: 'text/turtle',
        extension: 'ttl',
        run: ({ resolution, projections }) => {
            const { triples, problems } = skosTriples(resolution, projections);
            return { body: toTurtle(triples), problems };
        },
    },
    'skos-jsonld': {
        label: 'SKOS (JSON-LD)',
        contentType: 'application/ld+json',
        extension: 'jsonld',
        run: ({ resolution, projections }) => {
            const { triples, problems } = skosTriples(resolution, projections);
            return { body: toJsonLd(triples), problems };
        },
    },
};

/** The formats this service can produce. */
export const generatorNames = (() => Object.keys(GENERATORS));

/**
 * The formats this service can produce, described.
 *
 * What a client needs to offer a download it has never heard of: what to call it, and what it
 * arrives as. Adding a generator therefore reaches every consumer without a change in any of them,
 * which is the same rule the controlled sets follow.
 *
 * @returns {Array<{format: string, label: string, contentType: string, extension: string}>}
 */
export const generatorDescriptors = (() => Object.entries(GENERATORS)
    .map(([format, { label, contentType, extension }]) => ({
        format, label, contentType, extension,
    })));

/** Whether a name is a format. */
export const isGenerator = ((name) => Object.hasOwn(GENERATORS, name));

/**
 * Resolve a view and run a generator over it.
 *
 * @param {object} params
 * @param {string} params.viewId
 * @param {string} [params.format='json']
 * @param {string[]} [params.status] - Overrides the view's own default
 * @param {string} [params.language]
 * @returns {Promise<Artifact>}
 * @throws {Error} On an unknown view or an unknown format
 */
export async function generate({ viewId, format = 'json', status = null, language }) {
    if (!isGenerator(format)) {
        throw new Error(`No such format: ${format}. Available: ${generatorNames().join(', ')}`);
    }

    const [resolution, facets] = await Promise.all([
        resolveView({ viewId, status, language }),
        listFacets(),
    ]);
    const projections = skosProjectionIndex(facets);

    // **A SKOS document cannot say that one term has two sets of children.** `skos:narrower` belongs
    // to the concept, not to where it was placed, so the file would have to pick one set and say
    // nothing about having picked. Refused rather than resolved, and named so the editor can be
    // opened at the term that disagrees with itself.
    //
    // **Only the SKOS formats refuse**, and the boundary is what the format can express rather than
    // whether the state is wanted. `internal` and `json` are what the editor itself reads — the
    // header's counts come from `json` — so refusing them takes the view away from the person who is
    // midway through composing it and is the only one who can resolve it. A table carries structure
    // as data rather than as shape, so it can name both child sets without contradicting itself. All
    // of them carry `problems.divergent` out to the caller regardless, so nothing is hidden by not
    // throwing.
    const divergent = resolution.problems?.divergent ?? [];
    if (divergent.length && format.startsWith('skos-')) {
        const names = divergent.map((one) => one.termId).join(', ');
        throw new Error(`Cannot publish ${format}: ${divergent.length} term(s) have more than one set of children in this view — ${names}. SKOS gives a concept one set of narrower concepts, so give each of them the same children everywhere it appears, or place it once. The view itself still opens.`);
    }

    const generator = GENERATORS[format];

    // What this view publishes this format as, its own decisions over the built-in defaults. A view
    // that has never been configured gets the defaults, which reproduce what each generator did when
    // its choices were hardcoded.
    const profile = profileFor(resolution.view, format);

    // A generator may be asynchronous — anything that splits its output has to pack a zip — so this
    // is awaited whether or not the one that ran needed it.
    const produced = await generator.run({
        resolution,
        projections: projectionsWithOverrides(projections, profile),
        profile,
        facets,
    });

    // A generator may return a bare body or `{ body, problems }`. Both the resolver's problems and
    // the generator's are carried out to the caller: a view that silently dropped a hundred terms
    // and one that dropped none produce the same-looking document otherwise.
    const body = produced?.body !== undefined ? produced.body : produced;
    const problems = { ...resolution.problems, ...(produced?.problems ?? {}) };

    // A generator may also override what it is calling itself, because a format that splits its
    // output ships a zip rather than the thing that was asked for. The registry entry is the
    // default and stays right for every format that produces one document.
    const contentType = produced?.contentType ?? generator.contentType;
    const extension = produced?.extension ?? generator.extension;

    return {
        body,
        contentType,
        extension,
        filename: filenameFor(viewId, extension),
        problems,
    };
}
