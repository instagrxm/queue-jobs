const fs = require('fs-extra');
const path = require('path');
const csv = require('fast-csv');

/**
 * getCSV reads and parses csv file.
 * @param {string} filepath path to CSV file to read and parse.
 * @returns {Promise<Array[object]>} CSV entries
 */
function getCSV(filepath) {
  const filepath = path.join(__dirname, dir, filename);
  console.log('loading logs from', filepath);

  if (!fs.existsSync(filepath)) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const rows = [];
    csv
      .parseFile(filepath, { headers: true })
      .on('error', (error) => reject(error))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows));
  });
}

/**
 * setCSV saves given rows into CSV file.
 * @param {string} filepath path of where to save the CSV file.
 * @param {Array[object]} rows array of CSV entries.
 * @returns {Promise<void>}
 */
async function setCSV(dir, filename, rows) {
  const filepath = path.join(__dirname, dir, filename);
  await fs.ensureFile(filepath);
  return new Promise((resolve, reject) => {
    csv
      .writeToPath(filepath, rows, { headers: true })
      .on('error', (error) => reject(error))
      .on('end', () => resolve());
  });
}

module.exports = {
  getCSV,
  setCSV
};
