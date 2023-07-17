import fs from 'fs';
import path from 'path';

function createJsonArrayFile(fileName, arrayfilename) {
    const fileContent = fs.readFileSync(fileName, 'utf-8');
    const lines = fileContent.split('\n').map((line) => line.trim());
    const jsonArray = JSON.stringify(lines);
    console.log(jsonArray);
    fs.writeFileSync(arrayfilename, jsonArray);

    return jsonArray;
}

function moveMatchingAudioFiles(sourceFolder, destinationFolder, jsonArray) {
    // Get the list of audio files in the source folder
    const audioFiles = fs.readdirSync(sourceFolder).filter((file) => {
        const extension = path.extname(file).toLowerCase();
        return extension === '.mp3' || extension === '.wav';
    });

    // Filter the audio files that match the values in the jsonArray
    const matchingAudioFiles = audioFiles.filter((file) => {
        const fileName = path.parse(file).name;
        return jsonArray.includes(fileName);
    });

    // Move the matching audio files to the destination folder
    matchingAudioFiles.forEach((file) => {
        const sourcePath = path.join(sourceFolder, file);
        const destinationPath = path.join(destinationFolder, file);

        fs.renameSync(sourcePath, destinationPath);
        console.log(`Moved file: ${file}`);
    });

    console.log('All matching audio files moved.');
}

// Example usage
const sourceFolder = '../data/failed-calls';
const destinationFolder = '../data/upload';
const jsonArray = createJsonArrayFile('./file.txt', './jsonArray.json');

moveMatchingAudioFiles(sourceFolder, destinationFolder, jsonArray);
