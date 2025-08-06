const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const inputFilePath = path.join(__dirname, 'Arizona.csv');
const outputFilePath = path.join(__dirname, 'Arizona.json');

const parseCSVToJSON = () => {
    const results = [];

    fs.createReadStream(inputFilePath)
        .pipe(csv())
        .on('data', (row) => {
            const parsedData = {
                ...row,
                // index: row.index || null,
                location: `${row.city || ''}, ${row.state || ''}`.trim().replace(/^,|,$/g, '') || null,
            };
            results.push(parsedData);
        })
        .on('end', () => {
            fs.writeFile(outputFilePath, JSON.stringify(results, null, 2), (err) => {
                if (err) {
                    console.error('Error writing JSON file:', err);
                } else {
                    console.log('JSON file successfully created:', outputFilePath);
                }
            });
        })
        .on('error', (err) => {
            console.error('Error reading CSV file:', err);
        });
};

parseCSVToJSON();