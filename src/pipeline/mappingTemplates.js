import { fMamRequest } from '../controllers/fMamFetch.js';

/**
 * Resolving the mapping templates a run should use.
 *
 * A template says how a pipeline's tabular output becomes OMC. Which one applies is **project
 * configuration**, not a per-run choice: the point is that a template is attached once and every
 * subsequent run uses it, so changing the OMC a pipeline produces means editing the template rather
 * than editing the pipeline and cutting a release.
 *
 * The attachment lives in the project's existing free-form `settings` map, under
 * `mappingTemplate.<pipelineId>.<dataset>`, so it needs no new storage and is edited on the same
 * Admin page as every other per-project value.
 *
 * **The pipeline id is part of the key because an attachment belongs to a (pipeline, dataset)
 * pair, not to a dataset.** Without it, every attachment on a project was offered to every
 * pipeline that ran there: a template attached to Frame.io's `files` dataset was read as a stale
 * attachment by Script-E and Yamdu, which declare no datasets at all, and refused their runs. Two
 * pipelines emitting a same-named dataset would have collided the same way.
 *
 * @namespace namespace:LabkoatApi.mappingTemplates
 */

/** Prefix marking a project setting as a template attachment. */
const PREFIX = 'mappingTemplate.';

/**
 * The dataset → template id attachments that apply to one pipeline.
 *
 * Two key forms are understood:
 *
 * - `mappingTemplate.<pipelineId>.<dataset>` — the current form. Matched on the pipeline id, so
 *   another pipeline's attachment is invisible here. One naming a dataset this pipeline does not
 *   declare is genuinely stale, and is returned in `stale` to be reported.
 * - `mappingTemplate.<dataset>` — the original, unscoped form, written before attachments carried
 *   a pipeline id. It is claimed only by a pipeline that declares that dataset, because there is
 *   nothing else in the key to attribute it by. An unscoped key no pipeline claims is left alone
 *   rather than reported: it cannot be told apart from an attachment meant for a pipeline that is
 *   not running, which is exactly the confusion the scoped form removes. The Portal rewrites these
 *   to the scoped form whenever an attachment is changed, so they age out.
 *
 * @param {Object} [settings] - The project's settings map
 * @param {Object} params
 * @param {string} params.pipelineId - The pipeline being run
 * @param {Set<string>} params.declared - The dataset names that pipeline declares
 * @returns {{attached: Object.<string, string>, stale: Array<string>}} Template id by dataset
 *   name, and the datasets scoped to this pipeline that it does not produce
 */
export function attachedTemplates(settings = {}, { pipelineId, declared = new Set() } = {}) {
    const attached = {};
    const stale = [];
    for (const [key, value] of Object.entries(settings ?? {})) {
        if (!key.startsWith(PREFIX) || !value) continue;
        const segments = key.slice(PREFIX.length).split('.');
        if (segments.length === 2) {
            const [owner, dataset] = segments;
            if (owner !== pipelineId) continue;
            if (declared.has(dataset)) attached[dataset] = value;
            else stale.push(dataset);
        } else if (segments.length === 1 && declared.has(segments[0])) {
            // Unscoped, and this pipeline produces it — so it is ours. A scoped key for the same
            // dataset has already been taken above and wins; this only fills a gap.
            if (!Object.hasOwn(attached, segments[0])) attached[segments[0]] = value;
        }
    }
    return { attached, stale };
}

/**
 * Fetch the templates a run needs, as the pipeline expects them.
 *
 * Only this pipeline's attachments are considered, and only datasets it actually declares are
 * looked up: an attachment scoped to this pipeline that names a dataset it does not produce is
 * reported rather than fetched, because it means the configuration and the pipeline disagree and a
 * run would silently ignore it. Another pipeline's attachments are not this run's business — see
 * {@link attachedTemplates}.
 *
 * A template that cannot be found is also reported rather than skipped. Falling back to the
 * pipeline's built-in mapping would produce a successful run whose output quietly ignored the
 * configuration — which is worse than a run that refuses and says why.
 *
 * @param {Object} params
 * @param {Object} params.definition - The pipeline definition, for its id and declared datasets
 * @param {Object} [params.settings] - The project's settings
 * @returns {Promise<{mappings: Object.<string, Array<Object>>, problems: Array<string>}>} The
 *   mappings by dataset, and anything that stopped one being resolved
 */
export async function resolveMappings({ definition, settings }) {
    const { pipelineId } = definition;
    const declared = new Set((definition.datasets ?? []).map((d) => d.name));
    const { attached, stale } = attachedTemplates(settings, { pipelineId, declared });

    const mappings = {};
    const problems = stale.map((dataset) => (
        `"${PREFIX}${pipelineId}.${dataset}" names a dataset ${pipelineId} does not produce`
        + `${declared.size ? ` (it has: ${[...declared].join(', ')})` : ''}`
    ));
    if (!Object.keys(attached).length) return { mappings, problems };

    for (const [dataset, templateId] of Object.entries(attached)) {
        // Sequential: a pipeline has a handful of datasets, and one failure should name itself
        // rather than arriving as one of several rejected promises.
        const { status, payload } = await fMamRequest({
            method: 'GET', route: '/mappingTemplate', query: { id: templateId },
        });
        const template = payload?.data;
        if (status < 200 || status >= 300 || !template) {
            problems.push(`mapping template "${templateId}" for dataset "${dataset}" could not be `
                + 'read; it may have been deleted');
            continue;
        }
        if (!Array.isArray(template.mapping) || !template.mapping.length) {
            problems.push(`mapping template "${template.name ?? templateId}" maps nothing`);
            continue;
        }
        mappings[dataset] = template.mapping;
    }

    return { mappings, problems };
}
