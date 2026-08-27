import { awsSecrets } from 'mlHelpers';
import config from './src/config.js';
import { VOCAB_TERMS, VOCAB_VIEWS, vocabCollection } from './src/vocabulary/store/collections.js';
import { closeVocabMongo, initializeVocabMongo } from './src/vocabulary/store/mongoConnection.js';
const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
await initializeVocabMongo({ username: secrets.FMAM.FMAM_MONGO_USER, password: secrets.FMAM.FMAM_MONGO_PASSWORD, mongoUrl: config.VOCAB_MONGO_URL });
let rows = 0; let none = 0; let fork = 0; const forks = [];
for (const [kind, name] of [['term', VOCAB_TERMS], ['view', VOCAB_VIEWS]]) {
    for await (const d of vocabCollection(name).find({})) {
        const arrays = [d.member ?? [], ...(d.fork ?? []).map((f) => f.member ?? [])];
        for (const arr of arrays) for (const m of arr) {
            rows += 1;
            if (m.arrangement === 'none') none += 1;
            else if (m.arrangement) fork += 1;
        }
        for (const f of d.fork ?? []) forks.push(`${kind} ${d._id}#${f.id} "${f.name}" (${(f.member ?? []).length} rows)`);
    }
}
console.log(`member rows anywhere: ${rows}`);
console.log(`rows declining the arrangement (arrangement:'none'): ${none}`);
console.log(`rows naming a fork: ${fork}`);
console.log(`forks that exist: ${forks.length}`);
forks.forEach((f) => console.log('   ' + f));
await closeVocabMongo();
