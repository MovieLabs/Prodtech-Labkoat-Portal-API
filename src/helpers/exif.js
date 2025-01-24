const fs = require('fs');
const { ExifImage } = require('exif');
const probe = require('probe-image-size');

function readExif(filePath) {
    try {
        new ExifImage({
            image: filePath,
        }, (error, exifData) => {
            if (error) console.log(error.message);
            else console.log(exifData);
        });
    } catch (error) {
        console.log(error);
    }
}

async function imageSize(filePath) {
    const stream = fs.createReadStream(filePath);
    const res = await probe(stream);
    console.log(res);
}

module.exports = {
    readExif,
    imageSize,
};
