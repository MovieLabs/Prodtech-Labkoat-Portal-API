import { identifier as omcIdentifier } from 'omcUtil';

export function shootDay(yamduOmc, fMamOmc) {
    if (!yamduOmc || !fMamOmc) return;
    yamduOmc.forEach((ent) => {
        const narScene = omcIdentifier.find(fMamOmc, ent.identifier);
        ent.Context = narScene?.Context || null;
    });
}
