import dotenv from 'dotenv';
dotenv.config();
import Groq from 'groq-sdk';
import { query } from '../../dbClient';
import { writeFile } from 'fs/promises';
import { generateAudio } from '../../audioGenerator';
import { generateFillerContext } from '../../fillerContext';

const groq = new Groq({
	apiKey: process.env.GROQ_API_KEY,
});

async function generateBrainrotTranscript(
	topic: string,
	agentA: string,
	agentB: string
) {
	console.log('📝 Starting generateTranscript with params:', {
		topic,
		agentA,
		agentB,
	});

	try {
		console.log('🤖 Creating Groq chat completion...');
    const agentASpaced = agentA.replace("_", " ");
    const agentBSpaced = agentB.replace("_", " ");

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 
          `
            You are an expert dialogue generator for educational short-form videos written in podcast conversation style. You must create a back-and-forth script between two agents:

            - ${agentASpaced} is a **curious student** who is inquisitive and frantic. They ask meaningful, bold, silly, and/or exaggerated questions to hook the audience.
            - ${agentBSpaced} is an **expert teacher** and master of the topic who can explain the topic with extreme certainty, fun analogies, and occasional wild metaphors.

            ${agentBSpaced} will directly answer the questions asked by ${agentASpaced} about the topic in an enlightening, engaging, and humorous way. 
            Both agents are **caricatures of themselves**, behaving as exaggerated versions of their real-life personas with their actual mannerisms and styles of speech turned up to 11.

            The dialogue must:
            - Lead to short form video that is **no more than 60 seconds**
            - Contain **no more than 7 exchanges**
            - Start with ${agentASpaced} asking an **attention-grabbing intro question(s)** with ${agentBSpaced}'s name in it about the topic to hook viewers
            - Focus **75% on clearly explaining the topic**, and **25% on wild humor or entertainment**
            - Include slang/cursing only when it helps audience retention, pacing, or comic effect
            - Be suitable for a **wide, non-expert audience**, using vivid analogies and step-by-step simplification without sacrificing accuracy or depth.

            The agentId attribute should either be ${agentA} or ${agentB}. The text attribute should be that character's line of dialogue. Make it as humourous and engaging as possible while still being informative and educational. Remember, ${agentA} and ${agentB} are both ${agentASpaced} and ${agentBSpaced} behaving like they would in real life.

            The JSON format WHICH MUST BE ADHERED TO ALWAYS is as follows:
            {
              "transcript": [
                { "agentId": "the exact value of ${agentA} or ${agentB} depending on who is talking", "text": "their line of conversation in the dialog" }
              ]
            }
          `
        },
        {
          role: 'user',
          content: 
          `
            Generate a 60-second podcast-style dialogue on the topic: "${topic}"
            ${agentASpaced} (agentId: ${agentA}) should begin with a dramatic, funny, or ridiculous intro question about ${topic} that grabs the viewer's attention immediately.
            Then, ${agentBSpaced} (agentId: ${agentB}) should respond confidently, explaining the topic using analogies, humor, and simplification — but keeping everything technically accurate.
            The rest of the dialogue should alternate, with ${agentASpaced} reacting with exaggerated curiosity or shock, and ${agentBSpaced} continuing to break down the topic.
            Be outrageous, yes — but make the educational content *amazing*. Prioritize clarity, audience understanding, and momentum. Use slang, memes, or funny metaphors only when it adds entertainment *without derailing the topic*.
            Follow the required JSON format and keep the exchange count at 7 or less.
          `
        }
      ],
      response_format: { type: 'json_object' },
      model: 'llama3-70b-8192',
      temperature: 0.5,
      max_tokens: 2048,
      top_p: 1,
      stop: null,
      stream: false
    });


		console.log('✅ Chat completion received');
		const content = completion.choices[0]?.message?.content || '';
		console.log('📄 Content:', content);
		console.log('📄 Content length:', content.length);

		return content;
	} catch (error) {
		console.error('❌ Error in generateTranscript:', error);
		throw error;
	}
}

function delay(ms: number) {
	console.log(`⏳ Delaying for ${ms}ms`);
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function brainrotTranscript(
	topic: string,
	agentA: string,
	agentB: string
) {
	console.log('🎬 Starting transcriptFunction with params:', {
		topic,
		agentA,
		agentB,
	});

	let transcript: Transcript[] | null = null;
	let attempts = 0;

	while (attempts < 5) {
		console.log(`🔄 Attempt ${attempts + 1}/5`);
		try {
			console.log('📝 Generating transcript...');
			const content = await generateBrainrotTranscript(topic, agentA, agentB);

			console.log('🔍 Parsing content...');
			const parsedContent = content === '' ? null : JSON.parse(content);
			// Extract the transcript array from the response
			transcript = parsedContent?.transcript || null;

			if (transcript !== null && Array.isArray(transcript)) {
				console.log('✅ Valid transcript generated');
				console.log('📜 Transcript lines:');
				transcript.forEach((entry, index) => {
					console.log(`${index + 1}. ${entry.agentId}: "${entry.text}"`);
				});
				return transcript;
			} else {
				console.log('⚠️ Invalid or empty transcript received');
			}
		} catch (error) {
			console.error(`❌ Attempt ${attempts + 1} failed:`, error);
			console.log('⏳ Waiting before next attempt...');
			await delay(15000);
		}
		attempts++;
	}

	console.error('❌ All attempts failed');
	throw new Error(
		`Failed to generate valid transcript after 5 attempts for topic: ${topic}`
	);
}

export async function generateBrainrotTranscriptAudio({
	local,
	topic,
	agentA,
	agentB,
	music,
	videoId,
}: {
	local: boolean;
	topic: string;
	agentA: string;
	agentB: string;
	music: string;
	videoId?: string;
}) {
	console.log('⭐ Starting generateTranscriptAudio with params:', {
		local,
		topic,
		agentA,
	});

	try {
		if (!local) {
			console.log('📝 Updating video status - Generating transcript');
			await query(
				"UPDATE `pending-videos` SET status = 'Generating transcript', progress = 0 WHERE video_id = ?",
				[videoId]
			);
		}

		console.log('📜 Getting transcript from transcriptFunction');
		let transcript = (await brainrotTranscript(
			topic,
			agentA,
			agentB
		)) as Transcript[];
		console.log('✅ Transcript generated:', transcript.length, 'entries');

		const audios = [];

		if (!local) {
			await query(
				"UPDATE `pending-videos` SET status = 'Generating audio', progress = 12 WHERE video_id = ?",
				[videoId]
			);
		}

		for (let i = 0; i < transcript.length; i++) {
			const person = transcript[i].agentId;
			const line = transcript[i].text;

			const voice_id =
				person === 'JOE_ROGAN'
					? process.env.JOE_ROGAN_VOICE_ID
					: person === 'BARACK_OBAMA'
					? process.env.BARACK_OBAMA_VOICE_ID
					: person === 'BEN_SHAPIRO'
					? process.env.BEN_SHAPIRO_VOICE_ID
					: person === 'DONALD_TRUMP'
					? process.env.DONALD_TRUMP_VOICE_ID
					: person === 'JOE_BIDEN'
					? process.env.JOE_BIDEN_VOICE_ID
					: person === 'KAMALA_HARRIS'
					? process.env.KAMALA_HARRIS_VOICE_ID
					: person === 'ANDREW_TATE'
					? process.env.ANDREW_TATE_VOICE_ID
					: process.env.JORDAN_PETERSON_VOICE_ID;

			await generateAudio(voice_id ?? '', person, line, i);
			audios.push({
				person: person,
				audio: `public/voice/${person}-${i}.mp3`,
				index: i,
			});
		}

		const initialAgentName = audios[0].person;

		let contextContent = `
import { staticFile } from 'remotion';

export const music: string = ${
			music === 'NONE' ? `'NONE'` : `'/music/${music}.MP3'`
		};
export const initialAgentName = '${initialAgentName}';
export const videoFileName = '/background/MINECRAFT-0.mp4';
export const videoMode = 'brainrot';

export const subtitlesFileName = [
  ${audios
		.map(
			(entry, i) => `{
    name: '${entry.person}',
    file: staticFile('srt/${entry.person}-${i}.srt'),
  }`
		)
		.join(',\n  ')}
];
`;

		contextContent += generateFillerContext('brainrot');

		await writeFile('src/tmp/context.tsx', contextContent, 'utf-8');

		return { audios, transcript };
	} catch (error) {
		console.error('❌ Error in generateTranscriptAudio:', error);
		throw error;
	}
}
