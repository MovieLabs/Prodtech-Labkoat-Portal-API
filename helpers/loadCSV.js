/**
 * Load a CSV file and parse into JSON
 */

const io = require('./io');
const d3DSV = require('d3-dsv');


module.exports = async function loadCSV(params) {
    const { filePath, fileName } = params;
    console.log(`Load the CSV file ${filePath}/${fileName}`);
    const roleCSV = await io.loadFile(fileName,filePath);
    return d3DSV.csvParse(roleCSV)
}
