import { readFile } from 'node:fs/promises';
import { scoreBatPredictionFile } from './bat-reference.mjs';

const [referencePath, predictionPath, toleranceText] = process.argv.slice(2);
if (!referencePath || !predictionPath || !toleranceText) throw new Error('Usage: npm run score:bat-reference -- REFERENCE.json PREDICTIONS.json MAX_ERROR_PIXELS');
const reference = JSON.parse(await readFile(referencePath, 'utf8'));
const predictions = JSON.parse(await readFile(predictionPath, 'utf8'));
const summary = scoreBatPredictionFile(reference, predictions, Number(toleranceText));
console.log(JSON.stringify(summary));
if (!summary.passed) process.exitCode = 1;
