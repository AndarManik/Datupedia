// PCA.js
const fs = require('fs');
const math = require('mathjs');

/**
 * Reads PCA model data from a JSON file and creates a PCA transformation function
 * @returns {Promise<Function>} A promise that resolves to a function which takes a data point and transforms it using the PCA model
 */
function createPCA() {
    return new Promise((resolve, reject) => {
        fs.readFile('DatuPageHandlers/pca_model.json', 'utf8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }
        
            try {
                const modelData = JSON.parse(data);
                const components = math.matrix(modelData.components); // Direct access
                const mean = math.matrix(modelData.mean);             // Direct access
                const componentsTransposed = math.transpose(components);
        
                resolve(function (dataPoint) {
                    const centeredDataPoint = math.subtract(dataPoint, mean);
                    return math.multiply(centeredDataPoint, componentsTransposed).toArray();
                });
            } catch (error) {
                reject(error);
            }
        });
    
    });
}

module.exports = createPCA;
