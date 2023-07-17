import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanChatMessage } from "langchain/schema";
import fs from "fs/promises";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function normalizeSpeakers(arr, fileName) {
	let { contexts, nonPrimaryIndexes, primarySpeakers } = extractContexts(arr);
	console.log("Contexts", contexts);
	console.log("nonPrimaryIndexes", nonPrimaryIndexes);
	console.log("primary speakers:", primarySpeakers);

	if (!nonPrimaryIndexes.length == 0) {
		let determinedSpeakers = await askAI(contexts, primarySpeakers);
		console.log("AI-determined replacements", determinedSpeakers);

		let updatedData = updateSpeakers(
			arr,
			nonPrimaryIndexes,
			determinedSpeakers
		);
		// console.log(updatedData);
		await fs.writeFile(
			`./data/transcripts/tn-${fileName}.json`,
			JSON.stringify(updatedData)
		);

		// return updated data;
		return updatedData;
	}

	await fs.writeFile(
		`./data/transcripts/t-${fileName}.json`,
		JSON.stringify(arr)
	);

	return arr;
}

function extractContexts(arr) {
	try {
		let speakerCount = {};

		// count speaker frequencies
		for (let i = 0; i < arr.length; i++) {
			if (speakerCount[arr[i].speaker] !== undefined) {
				speakerCount[arr[i].speaker]++;
			} else {
				speakerCount[arr[i].speaker] = 1;
			}
		}

		// find the two most common speakers
		let primarySpeakers = Object.keys(speakerCount)
			.sort((a, b) => speakerCount[b] - speakerCount[a])
			.slice(0, 2);

		// Extract contexts for non-primary speakers
		let contexts = [];
		let nonPrimaryIndexes = []; // Store indexes of non-primary speakers
		for (let i = 0; i < arr.length; i++) {
			if (!primarySpeakers.includes(arr[i].speaker.toString())) {
				let context = arr.slice(
					Math.max(0, i - 10),
					Math.min(arr.length, i + 11)
				); // grab 10 before and 10 after, or as many as are available
				contexts.push(context);
				nonPrimaryIndexes.push(i);
			}
		}

		return { contexts, nonPrimaryIndexes, primarySpeakers };
	} catch (err) {
		console.log("Error with extractContents(): ", err);
	}
}

async function askAI(contexts, primarySpeakers) {
	try {
		let prompt = `In the following, each array represents a series of consecutive dialogues in a conversation. 
    In each array, one speaker has been incorrectly identified. Please determine which of the two primary speakers (${primarySpeakers[0]} or ${primarySpeakers[1]}) is the speaker of the incorrectly identified dialogue.
    The dialogue in question is always at the 11th position in the array, unless there are fewer than 11 dialogues before it, in which case it is towards the start of the array. 
    Conversely, if there are fewer than 11 dialogues after it, it will be towards the end of the array.
  
    Here are the dialogue contexts:\n`;

		// Adding each context to the prompt
		for (let i = 0; i < contexts.length; i++) {
			prompt += `\nContext ${i + 1}:\n`;
			for (let j = 0; j < contexts[i].length; j++) {
				prompt += `${contexts[i][j].speaker}: ${contexts[i][j].transcript}\n`;
			}
		}

		prompt += `\nPlease provide an array of the speaker (${primarySpeakers[0]} or ${primarySpeakers[1]}) for each context, in the same order as the contexts were presented. If the incorrectly identified dialogue is silence or '--', or text that can't be attributed to either primary speaker (${primarySpeakers[0]} or ${primarySpeakers[1]}), then assign it which ever value comes next given the context of the conversation (ie. if the object before it had a primary speaker of 1, then assign it the value of 2). Return your answer as an array of numbers:`;
		console.log(prompt);

		// Now you would pass this prompt to the language model
		// and parse its response into an array of primary speakers
		// Initiate an LLM instance and set the options
		const determinePrimarySpeakers = new ChatOpenAI({
			openAIApiKey: OPENAI_API_KEY,
			modelName: "gpt-4-32k",
			temperature: 0,
			maxTokens: 500,
		});

		const arrayOfPrimarySpeakers = await determinePrimarySpeakers.call([
			new HumanChatMessage(prompt),
		]);
		console.log(arrayOfPrimarySpeakers.text);

		// return array of speaker values
		return JSON.parse(arrayOfPrimarySpeakers.text); // ie. [0,1,0,0,1,0,0,0,1,0,3,1]
	} catch (err) {
		console.log("Error with askAI(): ", err);
	}
}

function updateSpeakers(originalArray, nonPrimarySpeakerIndexes, newSpeakers) {
	try {
		return originalArray.map((obj, index) => {
			// If the current object is a non-primary speaker object, update its speaker
			if (nonPrimarySpeakerIndexes.includes(index)) {
				// Grab the new speaker value from the AI returned array
				const newSpeaker = newSpeakers.shift();

				// Check if newSpeaker is a valid value, if not, don't update the speaker
				if (
					newSpeaker !== undefined &&
					(newSpeaker === 1 || newSpeaker === 2)
				) {
					return {
						...obj,
						speaker: newSpeaker,
					};
				}
				// If newSpeaker is not valid, leave the original speaker
				else {
					return {
						...obj,
						speaker: 1,
					};
				}
			}
			// If the current object is not a non-primary speaker object, return it as is
			else {
				return obj;
			}
		});
	} catch (err) {
		console.log("Error with updateSpeakers(): ", err);
	}
}
