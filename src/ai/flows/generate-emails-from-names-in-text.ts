
'use server';
/**
 * @fileOverview Identifies names in a block of text and generates plausible email address guesses for them.
 *
 * - generateEmailsFromNamesInText - A function that handles the name identification and email guessing process.
 * - GenerateEmailsFromNamesInTextInput - The input type for the function.
 * - GenerateEmailsFromNamesInTextOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateEmailsFromNamesInTextInputSchema = z.object({
  textBlock: z.string().describe('A block of text containing names for which email addresses should be guessed.'),
});
export type GenerateEmailsFromNamesInTextInput = z.infer<typeof GenerateEmailsFromNamesInTextInputSchema>;

const GenerateEmailsFromNamesInTextOutputSchema = z.object({
  guessedEmails: z.array(z.string().describe("A guessed email address generated for an identified name. Basic email format is expected but not deliverability.")).describe('A list of guessed email addresses.').default([]),
  generationSummary: z.string().describe('A summary of the names identified and the approach taken to generate email guesses.'),
});
export type GenerateEmailsFromNamesInTextOutput = z.infer<typeof GenerateEmailsFromNamesInTextOutputSchema>;

export async function generateEmailsFromNamesInText(input: GenerateEmailsFromNamesInTextInput): Promise<GenerateEmailsFromNamesInTextOutput> {
  try {
    const result = await generateEmailsPrompt(input);
    if (!result.output) {
      console.warn('AI model did not return an output for generateEmailsPrompt.');
      return {
        guessedEmails: [],
        generationSummary: 'AI model failed to process the text or generate email guesses.',
      };
    }
    return result.output;
  } catch (error) {
    console.error('CRITICAL_ERROR in generateEmailsFromNamesInText flow:', error instanceof Error ? error.stack : String(error));
    return {
      guessedEmails: [],
      generationSummary: 'A critical server error occurred during the email generation process. Please check server logs.',
    };
  }
}

const generateEmailsPrompt = ai.definePrompt({
  name: 'generateEmailsFromNamesPrompt',
  input: {schema: GenerateEmailsFromNamesInTextInputSchema},
  output: {schema: GenerateEmailsFromNamesInTextOutputSchema},
  prompt: `You are an expert at identifying names in text and creatively guessing potential email addresses for those names.
From the provided text block:
1. Identify any full names of individuals.
2. For each identified name, generate 1-3 plausible email address guesses.
   - Use common email patterns such as:
     - firstname.lastname@domain.com
     - firstinitiallastname@domain.com
     - firstname_lastname@domain.com
     - lastname.firstname@domain.com
     - firstname@domain.com
   - Prioritize using common public email domains such as gmail.com, outlook.com, yahoo.com.
   - If company names are clearly and strongly associated with individuals in the text, you MAY attempt to use a plausible company domain (e.g., if 'Acme Corp' is mentioned with 'John Doe', you could try john.doe@acmecorp.com). However, if the company domain is uncertain or the association is weak, stick to public domains to avoid making overly specific or incorrect guesses.
   - Ensure all generated email strings are correctly formatted (e.g., user@domain.com). Do not return strings that are not valid email formats.
3. Return these generated email addresses in the 'guessedEmails' array. If no names are identified or no plausible emails can be generated, return an empty array.
4. Provide a brief summary in 'generationSummary' explaining the names you identified (if any) and the general approach you took to generate emails (e.g., 'Identified 3 names: John Doe, Jane Smith. Generated emails using common patterns and public domains.' or 'No clear individual names found in the text.').

Input Text:
{{{textBlock}}}
`,
});
