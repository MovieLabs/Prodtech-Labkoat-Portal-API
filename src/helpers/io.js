/**
 * @module
 * @desc A set of methods to help with io, loading, saving, retrieving files
 * @type {module:fs}
 */

const fs = require('fs');
// const fetch = require('node-fetch');
const path = require('path');
const util = require('util');
const { createHash } = require('crypto');
const streamPipeline = util.promisify(require('stream').pipeline);

const { createReadStream, createWriteStream, ReadStream } = fs;
const currentDir = path.basename(__dirname);
const currentPath = () => __dirname.slice(0, __dirname.indexOf(currentDir) - 1);

/**
 * Delete a file in the directory
 * @param {string} fileName - The filename to be deleted
 * @param {string} pathName - Pathname of the target directory
 * @returns {Promise<unknown>}
 */
async function deleteFile(fileName, pathName = '') {
    const fullPath = path.join(pathName, fileName);
    return new Promise((resolve, reject) => {
        fs.unlink(fullPath, (err, items) => {
            if (err) {
                if (err.errno !== -4058) console.log(err); // Log unexpected errors
                reject(err);
            }
            resolve(items);
        });
    });
}

/**
 * Retrieve a list of files in the directory
 * @param {string} pathName - Pathname of the target directory
 * @returns {Promise<unknown>}
 */
async function directory(pathName = '') {
    const fullPath = pathName;
    // console.log(`Scanning the dir: ${fullPath}`);
    return new Promise((resolve, reject) => {
        fs.readdir(fullPath, (err, items) => {
            if (err) {
                if (err.errno !== -4058) console.log(err); // Log unexpected errors
                reject(err);
            }
            resolve(items);
        });
    });
}

/**
 * Retrieve of list of files that match a search string (no wildcards)
 * @param {string} pathName - Pathname of target directory
 * @param {string} searchTerm - String that is partially contained in the filenames
 * @returns {Promise}
 * @resolve {array} - An array containing all filenames in the directory
 * @reject {boolean} - False indicating the directory was not found
 */
async function dirSearch(pathName, searchTerm) {
    const searchRegex = new RegExp(searchTerm);
    try {
        const allFiles = await directory(pathName);
        return allFiles.filter((f) => f.match(searchRegex));
    } catch (err) {
        return false; // Presumes the directory was not found
    }
}

async function streamImage(fileName, pathName) {
    const fullPath = path.join(`${pathName}`, `${fileName}`);
    console.log(`Trying to stream ${fullPath}`);
    try {
        return fs.createReadStream(fullPath);
    } catch (err) {
        console.log(err);
        throw (err);
    }
}

// Load an XML file
async function loadXML(fileName, pathName = '') {
    const fullPath = path.join(`${pathName}`, (fileName.endsWith('.xml') ? fileName : `${fileName}.xml`));
    return new Promise((resolve, reject) => {
        fs.readFile(fullPath, 'utf8', (err, res) => {
            if (err !== null) {
                reject(err);
            }
            resolve(res);
        });
    });
}

/**
 * Load a file from disc, and return it as JSON
 *
 * @param {string} filename - The filename of the file to load
 * @param {string} pathName - The full path of the file to load
 * @returns {Promise<*>}
 */
async function loadJSON(filename, pathName = '') {
    const fullPath = path.join(pathName, (filename.endsWith('.json') ? filename : `${filename}.json`));
    console.log(`Trying to load: ${fullPath}`);

    return new Promise((resolve, reject) => {
        fs.readFile(fullPath, 'utf8', (err, res) => {
            if (err !== null) {
                reject(err);
            } else {
                console.log(`Got: ${filename}`)
                resolve(JSON.parse(res));
            }
        });
    });
}

/**
 * Load a file from disc, and return it as JSON
 *
 * @param {string} filename - The filename of the file to load
 * @param {string} pathName - The full path of the file to load
 * @returns {Promise<*>}
 */
async function loadFile(filename, pathName = '') {
    const fullPath = path.join(pathName, filename);
    console.log(`Trying to load: ${fullPath}`);

    return new Promise((resolve, reject) => {
        fs.readFile(fullPath, 'utf8', (err, res) => {
            if (err !== null) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

async function saveFile(pathName, content) {
    const fullPath = path.join(pathName);
    return new Promise((resolve, reject) => {
        fs.writeFile(fullPath, content, 'utf8', (err) => {
            if (err) reject(err);
            console.log(`File saved as: ${fullPath}`);
            resolve();
        });
    });
}

// Save an XML file to the logs
async function saveXML(fileName, content) {
    const pathName = fileName.endsWith('.xml') ? fileName : `${fileName}.xml`;
    return saveFile(pathName, content);
}

// Save a JSON file to the logs
async function saveJSON(fileName, obj) {
    const fullPath = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    const content = JSON.stringify(obj);
    return saveFile(fullPath, content);
}

/**
 * fetch JSON from a URL
 * @param {string } url - A resolvable UR
 * @param {object} options - fetch Options
 * @returns {Promise<any>}
 */

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, options);
    return response.json();
}

/**
 * Download a file from the endpoint at the provided URL, and save the resulting file
 * to filename, which should be a full path and name
 *
 * @param {string} url - A resolvable URL
 * @param {string} filename  - Full path and filename
 * @param {object} options - http options object, see node fetch <options>
 * @returns {Promise<void>}
 */

async function downloadURL(url, filename, options = { method: 'GET' }) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Unexpected response ${res.statusText}`);
    return streamPipeline(res.body, fs.createWriteStream(filename));
}

/**
 * Download a file from the endpoint at the provided URL, and save the resulting file
 * to filename, which should be a full path and name. The file is also hashed, using an
 * MD5 algorithm, and the hash value return in the response.
 *
 * @param {string} url  - A resolvable URL
 * @param {string} filename - Full path and filename
 * @param {object} options - http options object, see node fetch <options>
 * @param {string} hashMethod - The hashing algorithm to be used to create the hash, see node crypto
 * @returns {Promise<string>} - The hash of the downloaded and saved file
 */

/*
Takes a read stream and pipes this into the crypto module to create an md5 hash of the stream
This is returned as Promise that resolves with md5 hash as a hex string
 */
function promiseHash(readStream, hashMethod = 'md5') {
    return new Promise((resolve, reject) => {
        const h = createHash(hashMethod);
        h.once('error', () => {
            reject(Error('Hashing error'));
        });
        h.once('readable', function readHash() {
            const hash = this.read();
            // console.log(`The hash id ${hash.toString('hex')}`);
            resolve(hash.toString('hex')); // Returns a buffer as a hex string
        });
        readStream.pipe(h);
    });
}

/*
Takes a read stream and pipes to the write stream, then wraps the events in a Promise
 */
function promiseWrite(readStream, writeStream) {
    return new Promise((resolve, reject) => {
        writeStream.on('error', (err) => {
            reject(Error(err));
        });
        writeStream.on('close', () => {
            resolve();
        });
        readStream.pipe(writeStream);
    });
}

/**
 * Download a file from a URL and create a hash of the file while downloading
 *
 * @param {string} url  - A resolvable URL
 * @param {string} filename - Full path and filename
 * @param {object} options - http options object, see node fetch <options>
 * @param {string} hashMethod - The hashing algorithm to be used to create the hash, see node crypto
 * @returns {Promise<*>}
 */

async function downloadURLHashed(url, filename, options = { method: 'GET' }, hashMethod = 'md5') {
    const dl = fetch(url, options)
        .then((res) => {
            const readFileStream = res.body; // Response body is piped into the write streams for hashing and saving
            const writeFileStream = fs.createWriteStream(filename);
            const writePromise = promiseWrite(readFileStream, writeFileStream); // Add the write stream and Promisfy
            const hashPromise = promiseHash(readFileStream, hashMethod); // Add the hashing to the stream and Promisfy
            return Promise.all([hashPromise, writePromise]); // Wait for file transfer to complete
        })
        .catch((err) => {
            throw Error(err);
        });

    const myHash = await dl;
    return (myHash[0]); // Return the hash as the result
}

/**
 *
 * @param {string} filename - Full path and filename
 * @param {number} fileSize
 * @param {string} urlTo
 * @returns {Promise<*>}
 */

function awsUpload(filename, fileSize, urlTo) {
    return new Promise((resolve, reject) => {
        console.log(`${filename}: ${fileSize}`);
        fs.readFile(filename, (async (file) => {
            try {
                const options = {
                    method: 'PUT',
                    headers: {
                        'Content-Type': '*/*',
                        'Content-Length': fileSize,
                    },
                    body: file,
                };
                const ul = await fetch(urlTo, options);
                resolve(ul);
            } catch (err) {
                console.log(err);
                reject(err);
            }
        }));
    });
}

async function downloadURLtoUpload(urlFrom, urlTo, optionsFrom = {}, optionsTo = {}, fileName) {
    const dl = await fetch(urlFrom, optionsFrom);
    if (!dl.ok) throw new Error(`Unexpected response ${dl.statusText}`);

    const img = await streamPipeline(dl.body, createWriteStream(`./${fileName}`));
    const fileStats = fs.statSync(`./${fileName}`);

    const res = await awsUpload(`./${fileName}`, fileStats.size, urlTo);
    return res.status;
}

module.exports = {
    currentPath,
    deleteFile,
    dir: directory,
    dirSearch,
    streamImage,
    loadXML,
    loadJSON,
    loadFile,
    saveJSON,
    saveXML,
    saveFile,
    fetchJSON,
    downloadURL,
    downloadURLHashed,
    downloadURLtoUpload,
};
