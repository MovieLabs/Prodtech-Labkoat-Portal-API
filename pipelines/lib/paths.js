import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * The directory holding production folders (`WWDOAT/`, …), from `PIPELINE_FIXTURES`; null when
 * it is unset. Production data is kept outside every repository, so its location is configuration
 * rather than something this file can work out from where it sits.
 *
 * @memberof namespace:DataPipeline
 * @type {(string|null)}
 */
export const fixturesRoot = process.env.PIPELINE_FIXTURES ? path.resolve(process.env.PIPELINE_FIXTURES) : null;

function requireFixturesRoot() {
    if (!fixturesRoot) {
        throw new Error('Set PIPELINE_FIXTURES to the directory holding production folders, e.g. PIPELINE_FIXTURES=..');
    }
    return fixturesRoot;
}

/**
 * Resolve the input and output directories for one day of one source of one production.
 *
 * Layout is by convention, so new days and new sources need no code change:
 *   <fixtures>/<production>/sourceData/<source>/Filming Day <day>/
 *   <fixtures>/<production>/processedData/<source>/Day <day>/
 *
 * @memberof namespace:DataPipeline
 * @function dayPaths
 * @param {Object} opts - The selection
 * @param {string} opts.production - Production folder name
 * @param {string} opts.source - Source folder name
 * @param {(string|number)} opts.day - Filming day number
 * @returns {DataPipeline.DayPaths} The resolved directories
 */
export function dayPaths({ production, source, day }) {
    const root = requireFixturesRoot();
    return {
        sourceDir: path.join(root, production, 'sourceData', source, `Filming Day ${day}`),
        outDir: path.join(root, production, 'processedData', source, `Day ${day}`),
    };
}

/**
 * Where a production's generated OMC-JSON bundle lives. Not per day: the bundle spans every
 * day of the production, because its entities do.
 *
 * @memberof namespace:DataPipeline
 * @function omcPath
 * @param {Object} opts - The selection
 * @param {string} opts.production - Production folder name
 * @returns {string} The OMC output directory
 */
export function omcPath({ production }) {
    return path.join(requireFixturesRoot(), production, 'omc');
}

/**
 * Find the one file in a directory matching a pattern.
 *
 * Script-E prefixes every file with the full production title ("WORST DOUBLE DATE OF ALL
 * TIME ..."), which is not the folder name, so files are located by their distinctive
 * report-name suffix rather than by a constructed path.
 *
 * @memberof namespace:DataPipeline
 * @function findFile
 * @param {string} dir - Directory to search
 * @param {RegExp} pattern - Pattern matched against the file name
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.required] - Set `required: false` to allow a miss
 * @returns {Promise<(string|null)>} Absolute path, or null when absent and not required
 * @throws {Error} When required and zero or more than one file matches
 */
export async function findFile(dir, pattern, { required = true } = {}) {
    const entries = await readdir(dir, { withFileTypes: true });
    const matches = entries.filter((e) => e.isFile() && pattern.test(e.name)).map((e) => e.name);

    if (matches.length === 1) return path.join(dir, matches[0]);
    if (matches.length === 0) {
        if (required) throw new Error(`No file matching ${pattern} in ${dir}`);
        return null;
    }
    throw new Error(`Ambiguous: ${matches.length} files match ${pattern} in ${dir}: ${matches.join(', ')}`);
}
