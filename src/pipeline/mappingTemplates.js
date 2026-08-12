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
 * `mappingTemplate.<dataset>`, so it needs no new storage and is edited on the same Admin page as
 * every other per-project value.
 *
 * @namespace namespace:LabkoatApi.mappingTemplates
 */

/** Prefix marking a project setting as a template attachment. */
const PREFIX = 'mappingTemplate.';

/**
 * The dataset → template id attachments held against a project.
 *
 * @param {Object} [settings] - The project's settings map
 * @returns {Object.<string, string>} Template id by dataset name
 */
export function attachedTemplates(settings = {}) {
    return Object.entries(settings ?? {})
        .filter(([key, value]) => key.startsWith(PREFIX) && value)
        .reduce((acc, [key, value]) => ({ ...acc, [key.slice(PREFIX.length)]: value }), {});
}

/**
 * Fetch the templates a run needs, as the pipeline expects them.
 *
 * Only datasets the pipeline actually declares are looked up: a stale attachment naming a dataset
 * that no longer exists is reported rather than fetched, because it means the configuration and the
 * pipeline disagree and a run would silently ignore it.
 *
 * A template that cannot be found is also reported rather than skipped. Falling back to the
 * pipeline's built-in mapping would produce a successful run whose output quietly ignored the
 * configuration — which is worse than a run that refuses and says why.
 *
 * @param {Object} params
 * @param {Object} params.definition - The pipeline definition, for its declared datasets
 * @param {Object} [params.settings] - The project's settings
 * @returns {Promise<{mappings: Object.<string, Array<Object>>, problems: Array<string>}>} The
 *   mappings by dataset, and anything that stopped one being resolved
 */
export async function resolveMappings({ definition, settings }) {
    const attached = attachedTemplates(settings);
    const mappings = {};
    const problems = [];
    if (!Object.keys(attached).length) return { mappings, problems };

    const declared = new Set((definition.datasets ?? []).map((d) => d.name));

    for (const [dataset, templateId] of Object.entries(attached)) {
        if (!declared.has(dataset)) {
            problems.push(`"${PREFIX}${dataset}" names a dataset ${definition.pipelineId} does not `
                + `produce${declared.size ? ` (it has: ${[...declared].join(', ')})` : ''}`);
            continue;
        }
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
