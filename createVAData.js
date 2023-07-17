import fs from "fs/promises";
import path from "path";
import { generateVAP } from "./utils/generateVA.js";
import pLimit from "p-limit";

// ------------------------------------------------- //
// ----------- BATCH PROCESS AUDIO FILES ----------- //
// ------------------------------------------------- //

async function processFilesInFolder(
	sourceFolder,
	destinationFolder,
	deepgramResponseFolder,
	failedFolder,
	googleDrive,
	dualOrMono = "mono"
) {
	const limit = pLimit(5); // Limit concurrency to 10

	// Read all files in the directory
	const files = await fs.readdir(sourceFolder);

	// Map each file to a promise
	const promises = files.map((fileNameWithExtension) => {
		// Limit # of concurrent requests
		return limit(() =>
			processFile(
				fileNameWithExtension,
				sourceFolder,
				destinationFolder,
				deepgramResponseFolder,
				failedFolder,
				googleDrive,
				dualOrMono
			)
		);
	});

	// Wait for all promises to resolve
	await Promise.all(promises);

	console.log("\nAll files processed");
}

// ----------------------------------------- //
// ----------- UTILITY FUNCTIONS ----------- //
// ----------------------------------------- //

async function processFile(
	fileNameWithExtension,
	sourceFolder,
	destinationFolder,
	deepgramResponseFolder,
	failedFolder,
	googleDrive,
	dualOrMono
) {
	try {
		// Get fileName without extension
		const fileNameWithoutExtension = path.parse(fileNameWithExtension).name;
		const destinationFile = path.join(
			destinationFolder,
			`${fileNameWithoutExtension}.json`
		);

		// Check if file exists in the destination folder
		try {
			await fs.access(destinationFile, fs.constants.F_OK);
			console.log(`${destinationFile} exists, skipping...`);
			return; // Skip this file
		} catch (err) {
			console.log(`${destinationFile} does not exist, generating data...`);
		}

		// File does not exist, generate & Save Voice Activity Data
		let vaData;
		try {
			vaData = await generateVAP(
				sourceFolder,
				deepgramResponseFolder,
				fileNameWithoutExtension,
				dualOrMono
			);
		} catch (err) {
			console.error(
				`Failed to generate VAP for ${fileNameWithExtension}: ${err}`
			);
			await moveToFailedFolder(
				fileNameWithExtension,
				sourceFolder,
				failedFolder
			);
			return; // Skip this file
		}

		try {
			await saveData(vaData, fileNameWithoutExtension, destinationFolder);
			await saveToGoogleDrive(vaData, fileNameWithoutExtension, googleDrive);
		} catch (err) {
			console.error(`Failed to save data for ${fileNameWithExtension}: ${err}`);
			try {
				console.log("Attempting to save again");
				await saveData(vaData, fileNameWithoutExtension, destinationFolder);
				await saveToGoogleDrive(vaData, fileNameWithoutExtension, googleDrive);
			} catch {
				console.error(
					`Failed SECOND TIME to save data for ${fileNameWithExtension}: ${err}`
				);
				await moveToFailedFolder(
					fileNameWithExtension,
					sourceFolder,
					failedFolder
				);
			}
		}
	} catch (err) {
		console.error(
			`Unexpected error processing ${fileNameWithExtension}: ${err}`
		);
		await moveToFailedFolder(fileNameWithExtension, sourceFolder, failedFolder);
	}
}

async function moveToFailedFolder(
	fileNameWithExtension,
	sourceFolder,
	failedFolder
) {
	const oldPath = path.join(sourceFolder, fileNameWithExtension);
	const newPath = path.join(failedFolder, fileNameWithExtension);
	await fs.rename(oldPath, newPath);
	console.log(`Moved ${fileNameWithExtension} to the failed folder.`);
}

async function saveData(vaData, fileNameWithoutExtension, destinationFolder) {
	// Set the save destination for the VA Data
	const newFilePath = path.join(
		destinationFolder,
		`${fileNameWithoutExtension}.json`
	);

	// Write the VA Data to a new file
	await fs.writeFile(newFilePath, JSON.stringify(vaData, null, 2));
	console.log(`Processed file ${fileNameWithoutExtension}.json`);
}

async function saveToGoogleDrive(
	vaData,
	fileNameWithoutExtension,
	destinationFolder
) {
	// Ensure the directory exists, if not, the write process will fail
	try {
		await fs.access(destinationFolder);
	} catch (err) {
		console.log("Directory does not exist. Creating the directory...");
		await fs.mkdir(destinationFolder, { recursive: true });
		console.log("Directory created.");
	}

	// Set the save destination for the VA Data
	const newFilePath = path.join(
		destinationFolder,
		`${fileNameWithoutExtension}.json`
	);

	// Write the VA Data to a new file in Google Drive
	try {
		await fs.writeFile(newFilePath, JSON.stringify(vaData, null, 2), "utf8");
		console.log("JSON file has been saved.");
	} catch (err) {
		console.log("An error occurred while writing JSON Object to File.");
		console.log(err);
	}
}

// ------------------------------------------------- //
// ---------------- RUN THE FUNCTION --------------- //
// ------------------------------------------------- //
processFilesInFolder(
	// "./data/upload-air-twilio",
	"./data/upload",
	"./data/generated",
	// "./data/generated-VA-data (all air twilio calls)",
	"./data/deepgram-response",
	"./data/failed-calls",
	"/Users/tmc/Library/CloudStorage/GoogleDrive-tony@air.ai/My Drive/All-Twilio-Call-TimeStamp-Data",
	"dual"
);
