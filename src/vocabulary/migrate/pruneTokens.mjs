/**
 * Remove the authored `omcToken` labels that derivation already reproduces.
 *
 * ```
 * node src/vocabulary/migrate/pruneTokens.mjs            # report only
 * node src/vocabulary/migrate/pruneTokens.mjs --write    # apply
 * ```
 *
 * `labelOfType` derives an `omcToken` from the preferred name when a term carries none, so a stored
 * token identical to what deriving would produce is a second copy of a fact the code already knows.
 * Two copies of one fact is one that can go stale: rename the term and the derived token follows
 * while the stored one does not, and the stored one wins.
 *
 * **Only the identical ones.** Deriving is a fallback, not the rule — a token routinely drops the
 * part of the name the dotted path already supplies, which is why `VFX Shot` is `vfx` under `shot`
 * and `Camera Roll` is `roll` under `camera`. That decision depends on where the term sits and
 * nothing can derive it, so every token that differs is authored and stays.
 *
 * Nothing published moves: for the terms this touches, the derived string is the stored string.
 * That is the condition for removing it.
 *
 * Dry by default.
 *
 * @module vocabulary/migrate/pruneTokens
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { VOCAB_TERMS, vocabCollection } from '../store/collections.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';
import { prefLabel, tokenFromName } from '../store/read.js';

const APPLY = process.argv.includes('--write');

const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
await initializeVocabMongo({
    username: secrets.FMAM.FMAM_MONGO_USER,
    password: secrets.FMAM.FMAM_MONGO_PASSWORD,
    mongoUrl: config.VOCAB_MONGO_URL,
});

const store = vocabCollection(VOCAB_TERMS);
const terms = await store.find({ 'label.labelType': 'omcToken' }).toArray();

const redundant = [];
const authored = [];

terms.forEach((term) => {
    const tokens = (term.label ?? []).filter((entry) => entry.labelType === 'omcToken');
    const derived = tokenFromName(prefLabel(term));
    // Every token this term carries, not just the first: a second one in another language cannot be
    // derived from an English preferred name, so it is authored whatever its value.
    const same = tokens.filter((entry) => (entry.language ?? 'en') === 'en' && entry.value === derived);
    if (!same.length) {
        authored.push(`${prefLabel(term)}: ${tokens.map((entry) => entry.value).join(', ')} (derives ${derived})`);
        return;
    }
    redundant.push({ term, keep: (term.label ?? []).filter((entry) => !same.includes(entry)) });
});

console.log(`terms carrying an authored omcToken: ${terms.length}`);
console.log(`  reproduced exactly by derivation, so removable: ${redundant.length}`);
console.log(`  differing, so authored and kept: ${authored.length}`);

console.log('\nA sample of what stays, which is the reason not to remove them all:\n');
authored.slice(0, 10).forEach((line) => console.log(`  ${line}`));

console.log('\nA sample of what goes:\n');
redundant.slice(0, 10).forEach(({ term }) => {
    console.log(`  ${prefLabel(term)} -> ${tokenFromName(prefLabel(term))}`);
});

if (!APPLY) {
    console.log('\nDry run. Pass --write to apply.');
} else {
    for (const { term, keep } of redundant) {
        await store.updateOne({ _id: term._id }, { $set: { label: keep } });
    }
    console.log(`\nRemoved ${redundant.length} redundant tokens.`);
}

await closeVocabMongo();
