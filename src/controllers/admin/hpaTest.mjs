import fetch from 'node-fetch';

import InternalError from '../../errors/InternalError.mjs';
import hpaCharacter from './omcCharacter.mjs';
import hpaNarLocation from './omcNarLocation.mjs';

const trayIoUrl = 'https://1b87c421-2e94-44f6-bd1f-bd4947294848.trayapp.io';
const trayIoAi = 'https://cf57d7f9-9102-4c65-b587-b61a73d45bb0.trayapp.io';

export async function updatedCharacter(req, res, next) {
    console.log('GET: /admin/testCharacter');
    const url = trayIoUrl;
    const body = JSON.stringify(hpaCharacter);
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    };

    try {
        const trayResponse = await fetch(url, options);
        console.log('Tray IO status:', trayResponse.status);

        res.status(trayResponse.status)
            .end();
    } catch (err) {
        console.log(err);
        next(new InternalError('Tray IO error'));
    }
}

export async function updatedNarLocation(req, res, next) {
    console.log('GET: /admin/testNarLocation');
    const url = trayIoAi;
    const body = JSON.stringify(hpaNarLocation);
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    };

    try {
        const trayResponse = await fetch(url, options);
        console.log('Tray IO status:', trayResponse.status);

        res.status(trayResponse.status)
            .end();
    } catch (err) {
        console.log(err);
        next(new InternalError('Tray IO error'));
    }
}
