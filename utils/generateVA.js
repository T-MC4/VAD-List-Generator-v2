import dotenv from "dotenv";
dotenv.config();
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

import { normalizeSpeakers } from "./normalize-speakers.js";
import axios from "axios";
import axiosRetry from "axios-retry";
import path from "path";
import fs from "fs";

process.on("uncaughtException", function (err) {
	if (err.code === "EPIPE") {
		console.error("Ignoring EPIPE error");
	} else {
		console.error(`Unhandled exception: ${err}`);
		process.exit(1);
	}
});

const MAX_RETRIES = 3; // Set the number of times to retry the request. You may wish to adjust this.
const TIMEOUT = 60000; // Set request timeout to 60 seconds. Adjust this as needed.
const axiosInstance = axios.create(); // Create an axios instance

axiosRetry(axiosInstance, {
	retries: MAX_RETRIES,
	retryDelay: axiosRetry.exponentialDelay,
	retryCondition: (err) => {
		return (
			err.code === "EPIPE" || axiosRetry.isNetworkOrIdempotentRequestError(err)
		);
	},
});

export async function generateVAP(
	sourceFolder,
	deepgramResponseFolder,
	fileNameWithoutExtension,
	dualOrMono
) {
	try {
		// Set file path
		console.log("\nsetting file path");
		let filePath = path.join(sourceFolder, `${fileNameWithoutExtension}.wav`);
		console.log("file path set", filePath);

		// Check if the .wav file exists before proceeding
		if (!fs.existsSync(filePath)) {
			// If the .wav file doesn't exist...
			console.log(`File ${filePath} does not exist. Trying mp3 path now...`);
			// ...Check if the .mp3 file exists before proceeeding
			filePath = path.join(sourceFolder, `${fileNameWithoutExtension}.mp3`);
			if (!fs.existsSync(filePath)) {
				// If the .mp3 file doesn't exist, throw an error
				throw new Error(`File ${filePath} does not exist.`);
			}
		}

		// Set deepgram response file path
		console.log("\nsetting file path");
		let deepgramResponseFilePath = path.join(
			deepgramResponseFolder,
			`${fileNameWithoutExtension}.json`
		);
		console.log("file path set", deepgramResponseFilePath);

		// Check if the deepgram response already exists before making any API calls
		let json;
		if (fs.existsSync(deepgramResponseFilePath)) {
			// If the deepgram response already exists, read the contents
			json = JSON.parse(fs.readFileSync(deepgramResponseFilePath, "utf8"));
			console.log("Existing deepgram response was read");
		} else {
			// ...If it doesn't exist, then make an API call...
			console.log("No existing deepgram response - Setting up API Call...");

			// Set API endpoint and options
			const url =
				"https://api.deepgram.com/v1/listen?utterances=true&model=phonecall&tier=nova&multichannel=true&diarize=true&punctuate=true";
			const options = {
				method: "post",
				url: url,
				headers: {
					Authorization: `Token ${deepgramApiKey}`,
					"Content-Type": determineMimetype(filePath),
				},
				data: fs.createReadStream(filePath),
				timeout: TIMEOUT, // setting timeout
			};

			// get API response
			const response = await axiosInstance(options);
			json = response.data; // Deepgram Response
			console.log(`API Call for ${fileNameWithoutExtension} was completed`);

			// Save the deepgram response
			fs.writeFileSync(deepgramResponseFilePath, JSON.stringify(json));
			console.log(`Deepgram Response saved for ${fileNameWithoutExtension}`);
		}

		// ------------------------------------------- //
		// ----------- PROCESS MONO AUDIOS ----------- //
		// ------------------------------------------- //

		if (dualOrMono === "mono") {
			// Get utterances
			const utterances = getUtterancesArry(json);

			// Normalize the utterances so there are only 2 speakers
			const normalized = await normalizeSpeakers(
				utterances,
				fileNameWithoutExtension
			);
			console.log(normalized);

			// Format the JSON to [ [...], [...] ]
			const vaData = transformUtterances(normalized);

			// Return the transcript
			return vaData;

			// ------------------------------------------- //
			// ----------- PROCESS DUAL AUDIOS ----------- //
			// ------------------------------------------- //
			//
		} else if (dualOrMono === "dual") {
			// Get utterances
			const vaData = parseDeepgramJson(json);

			// Return the transcript
			return vaData;
		} else {
			throw Error(
				'Not a valid "dualOrMono" value - For maximum accuracy, the generateVAP() function needs to know whether the audio is multichannel (aka, "dual") or monochannel (aka, "mono")'
			);
		}
	} catch (err) {
		console.log(`Error with generateVAP(): ${err}`);
		if (
			err.code === "EPIPE" ||
			axiosRetry.isNetworkOrIdempotentRequestError(err)
		) {
			console.error("Request failed after " + MAX_RETRIES + " retries", err);
			// Don't re-throw, just log and return
			return null;
		} else if (err.code === "ENOTFOUND") {
			console.log(
				"ENOTFOUND error occurred. Please check your internet connection."
			);
		} else if (err.code === "ECONNRESET") {
			console.log("Connection reset by peer!");
			return null;
		} else if (err.response) {
			// The request was made and the server responded with a status code
			// that falls out of the range of 2xx
			console.log("1", err.response.data);
			console.log("2", err.response.status);
			console.log("3", err.response.headers);
		} else if (err.request) {
			// The request was made but no response was received
			console.log(err.request);
		} else {
			// Something happened in setting up the request that triggered an Error
			console.log("Error", err.message);
		}
		// For errors that aren't EPIPE or network/idempotent errors, re-throw
		if (
			!(
				err.code === "EPIPE" ||
				axiosRetry.isNetworkOrIdempotentRequestError(err)
			)
		) {
			throw err;
		}
	}
}

function determineMimetype(file) {
	const extension = path.extname(file);
	switch (extension) {
		case ".wav":
			return "audio/wav";
		case ".mp3":
			return "audio/mpeg";
		case ".m4a":
			return "audio/mp4";
		// Add more cases as needed for different file types
		default:
			return "application/octet-stream"; // default to binary if unknown
	}
}

function transformUtterances(utterances) {
	console.log("Transforming Utterances");

	// Create empty arrays for two speakers
	let speaker0 = [];
	let speaker1 = [];

	// Iterate over each utterance using forEach
	utterances.forEach((utterance) => {
		let { speaker, start, end } = utterance;

		// Use array destructuring to assign start and end times to arrays
		speaker === 1 ? speaker0.push([start, end]) : speaker1.push([start, end]);
	});

	return [speaker0, speaker1];
}

function getUtterancesArry(data) {
	console.log("Getting Utterances");
	// Create empty array
	let arr = [];

	// Extract the utterances array
	const utterances = data.results.utterances;
	console.log(utterances);

	// Iterate over each utterance using forEach
	utterances.forEach((utterance) => {
		let { speaker, start, end, transcript } = utterance;

		// Use array destructuring to assign start and end times to arrays
		arr.push({ speaker, start, end, transcript });
	});

	return arr;
}

function parseDeepgramJson(data, utt_split = 0.8) {
	let result = [];

	data.results.channels.forEach((channel) => {
		let temp = [];
		let words = channel.alternatives[0].words;
		let start_time = words[0].start;
		let end_time = words[0].end;

		for (let i = 1; i < words.length; i++) {
			if (words[i].start - end_time > utt_split) {
				temp.push([start_time, end_time]);
				start_time = words[i].start;
			}
			end_time = words[i].end;
		}
		temp.push([start_time, end_time]);
		result.push(temp);
	});

	return result;
}
