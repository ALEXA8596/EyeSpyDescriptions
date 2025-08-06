const fs = require('fs');
const path = require('path');

function jsonToCSV() {
  try {
    // Read the JSON file
    const jsonFilePath = path.join(__dirname, 'AZNew.json');
    const csvFilePath = path.join(__dirname, 'AZNew.csv');
    
    console.log('Reading JSON file...');
    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      throw new Error('JSON file is empty or not an array');
    }
    
    console.log(`Found ${jsonData.length} records`);
    
    // Get headers in the order they appear in the first object, then add any missing ones
    const headers = [];
    const allKeys = new Set();
    
    // First, get keys from the first object to preserve order
    if (jsonData.length > 0) {
      Object.keys(jsonData[0]).forEach(key => {
        headers.push(key);
        allKeys.add(key);
      });
    }
    
    // Then add any additional keys from other objects (in case some objects have different fields)
    jsonData.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!allKeys.has(key)) {
          headers.push(key);
          allKeys.add(key);
        }
      });
    });
    
    console.log('Headers:', headers);
    
    // Helper function to escape CSV values
    function escapeCSVValue(value) {
      if (value === null || value === undefined) {
        return '';
      }
      
      // Convert to string
      let stringValue = String(value);
      
      // If value contains comma, newline, or double quote, wrap in quotes and escape quotes
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes('"')) {
        stringValue = '"' + stringValue.replace(/"/g, '""') + '"';
      }
      
      return stringValue;
    }
    
    // Create CSV content
    let csvContent = '';
    
    // Add headers
    csvContent += headers.map(header => escapeCSVValue(header)).join(',') + '\n';
    
    // Add data rows
    jsonData.forEach((item, index) => {
      const row = headers.map(header => {
        const value = item[header];
        return escapeCSVValue(value);
      });
      csvContent += row.join(',') + '\n';
      
      // Show progress for large files
      if ((index + 1) % 100 === 0) {
        console.log(`Processed ${index + 1}/${jsonData.length} records`);
      }
    });
    
    // Write CSV file
    console.log('Writing CSV file...');
    fs.writeFileSync(csvFilePath, csvContent, 'utf8');
    
    console.log(`✅ Successfully converted JSON to CSV!`);
    console.log(`📁 Input file: ${jsonFilePath}`);
    console.log(`📁 Output file: ${csvFilePath}`);
    console.log(`📊 Records processed: ${jsonData.length}`);
    console.log(`📋 Columns: ${headers.length}`);
    
  } catch (error) {
    console.error('❌ Error converting JSON to CSV:', error.message);
    console.error(error.stack);
  }
}

// Run the conversion
if (require.main === module) {
  jsonToCSV();
}

module.exports = jsonToCSV;
