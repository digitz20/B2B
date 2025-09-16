
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
  extractedEmails: z.array(z.string().describe("An email address extracted from the text.")).describe('A list of email addresses extracted from the input text.').default([]),
  originalTextCharacterCount: z.number().describe('The total number of characters in the original input text block.'),
  extractionSummary: z.string().describe('A brief summary of the extraction process, e.g., "Extracted X email(s) from a text of Z characters."'),
});
export type ExtractEmailsFromTextOutput = z.infer<typeof ExtractEmailsFromTextOutputSchema>;

export async function extractEmailsFromText(input: ExtractEmailsFromTextInput): Promise<ExtractEmailsFromTextOutput> {
  return extractEmailsFromTextFlow(input);
}

const extractEmailsPrompt = ai.definePrompt({
  name: 'extractEmailsFromTextPrompt',
  input: {schema: ExtractEmailsFromTextInputSchema},
  output: {schema: z.object({
    extractedEmails: z.array(z.string()).describe('A list of email addresses found in the text.').default([]),
  })},
  prompt: `You are an email extraction specialist.
Your task is to meticulously parse the provided text block and identify all strings that appear to be email addresses.
Return all strings that look like email addresses.

Input Text:
{{{textBlock}}}

Based on the input text, extract all potential email addresses and list them in the 'extractedEmails' array. If no emails are found, return an empty array.
`,
});

const extractEmailsFromTextFlow = ai.defineFlow(
  {
    name: 'extractEmailsFromTextFlow',
    inputSchema: ExtractEmailsFromTextInputSchema,
    outputSchema: ExtractEmailsFromTextOutputSchema,
  },
  async (input: ExtractEmailsFromTextInput): Promise<ExtractEmailsFromTextOutput> => {
    try {
      const llmResponse = await extractEmailsPrompt(input);
      
      const fallbackCharCount = input?.textBlock?.length || 0;

      if (!llmResponse.output) {
          console.warn('AI model did not return an output for extractEmailsFromTextPrompt.');
          return {
              extractedEmails: [],
              originalTextCharacterCount: fallbackCharCount,
              extractionSummary: `AI model failed to process the text. Character count: ${fallbackCharCount}.`,
          };
      }

      const extractedEmails = llmResponse.output.extractedEmails || [];
      const finalSummary = `Extracted ${extractedEmails.length} email(s) from a text of ${fallbackCharCount} characters. No external validation was performed.`;

      return {
        extractedEmails: extractedEmails,
        originalTextCharacterCount: fallbackCharCount,
        extractionSummary: finalSummary,
      };
    } catch (error) {
      console.error('CRITICAL_ERROR in extractEmailsFromTextFlow:', error instanceof Error ? error.stack : String(error));
      return {
        extractedEmails: [],
        originalTextCharacterCount: input?.textBlock?.length || 0,
        extractionSummary: 'A critical server error occurred. Please check server logs or try again later.',
      };
    }
  }
);
