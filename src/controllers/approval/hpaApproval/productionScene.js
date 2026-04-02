import { identifier as omcIdentifier } from 'omcUtil';

export default function productionScene(yamduOmc, fMamOmc) {
    if ((!yamduOmc || !yamduOmc.ProductionScene) || !fMamOmc) return;
    const yamduProdScene = yamduOmc.ProductionScene;
    const fMamProdScene = fMamOmc.ProductionScene;
    yamduProdScene.forEach((ent) => {
        const matchedScene = omcIdentifier.find(fMamProdScene, ent.identifier);
        if (matchedScene) {
            ent.Context = matchedScene.Context; // Add the Context from the fMam to the Yamdu entity
        }
    });
}
