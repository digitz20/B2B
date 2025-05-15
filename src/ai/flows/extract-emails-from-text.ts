'use server';
/**
 * @fileOverview Extracts email addresses from a given block of text.
 *
 * - extractEmailsFromText - A function that handles the email extraction process.
 * - ExtractEmailsFromTextInput - The input type for the extractEmailsFromText function.
 * - ExtractEmailsFromTextOutput - The return type for the extractEmailsFromText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractEmailsFromTextInputSchema = z.object({
  textBlock: z.string().describe('A block of text from which email addresses need to be extracted.'),
});
export type ExtractEmailsFromTextInput = z.infer<typeof ExtractEmailsFromTextInputSchema>;

const ExtractEmailsFromTextOutputSchema = z.object({
  extractedEmails: z.array(z.string().describe("A valid email address extracted from the text.")).describe('A list of email addresses extracted from the input text.').default([]),
  originalTextCharacterCount: z.number().describe('The total number of characters in the original input text block.'),
  extractionSummary: z.string().describe('A brief summary of the extraction process, e.g., "Extracted X email(s) from a text of Y characters."'),
});
export type ExtractEmailsFromTextOutput = z.infer<typeof ExtractEmailsFromTextOutputSchema>;

export async function extractEmailsFromText(input: ExtractEmailsFromTextInput): Promise<ExtractEmailsFromTextOutput> {
  return extractEmailsFromTextFlow(input);
}

const extractEmailsPrompt = ai.definePrompt({
  name: 'extractEmailsFromTextPrompt',
  input: {schema: ExtractEmailsFromTextInputSchema},
  output: {schema: ExtractEmailsFromTextOutputSchema},
  prompt: `You are an email extraction specialist.
Your task is to meticulously parse the provided text block and identify all valid email addresses.
Return only properly formatted email addresses.

Input Text:
{{{textBlock}}}

Based on the input text:
1. Extract all email addresses and list them in the 'extractedEmails' array. If no emails are found, return an empty array.
2. Calculate the total character count of the original 'textBlock' and provide it in 'originalTextCharacterCount'.
3. Provide a concise summary in 'extractionSummary', such as 'Extracted N email(s) from a text of Y characters.' or 'No email addresses found in the provided text of Y characters.' if none are found.
Ensure all output fields ('extractedEmails', 'originalTextCharacterCount', 'extractionSummary') are always populated according to the schema.
`,
});

const extractEmailsFromTextFlow = ai.defineFlow(
  {
    name: 'extractEmailsFromTextFlow',
    inputSchema: ExtractEmailsFromTextInputSchema,
    outputSchema: ExtractEmailsFromTextOutputSchema,
  },
  async (input: ExtractEmailsFromTextInput) => {
    const response = await extractEmailsPrompt(input);
    const result = response.output;

    if (!result) {
      // This case implies a failure in the AI model to produce schema-compliant output.
      // Construct a fallback response or throw an error.
      const charCount = input.textBlock.length;
      return {
        extractedEmails: [],
        originalTextCharacterCount: charCount,
        extractionSummary: `AI model failed to process the text. Character count: ${charCount}.`,
      };
    }
    
    // Ensure extractedEmails is an array, even if Zod default didn't cover a weird model output (though it should)
    if (!Array.isArray(result.extractedEmails)) {
        result.extractedEmails = [];
    }
    
    return result;
  }
);
