
'use server';
/**
 * @fileOverview Extracts email addresses from a given block of text and validates them using ZeroBounce.
 *
 * - extractEmailsFromText - A function that handles the email extraction and validation process.
 * - ExtractEmailsFromTextInput - The input type for the extractEmailsFromText function.
 * - ExtractEmailsFromTextOutput - The return type for the extractEmailsFromText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { validateEmailTool, type ValidateEmailOutput } from '@/ai/tools/validate-email-tool';

const ExtractEmailsFromTextInputSchema = z.object({
  textBlock: z.string().describe('A block of text from which email addresses need to be extracted.'),
});
export type ExtractEmailsFromTextInput = z.infer<typeof ExtractEmailsFromTextInputSchema>;

const ExtractEmailsFromTextOutputSchema = z.object({
  extractedEmails: z.array(z.string().describe("A valid, VERIFIED email address extracted from the text.")).describe('A list of VERIFIED email addresses extracted from the input text.').default([]),
  originalTextCharacterCount: z.number().describe('The total number of characters in the original input text block.'),
  extractionSummary: z.string().describe('A brief summary of the extraction and verification process, e.g., "Extracted X email(s), Y verified, from a text of Z characters."'),
});
export type ExtractEmailsFromTextOutput = z.infer<typeof ExtractEmailsFromTextOutputSchema>;

export async function extractEmailsFromText(input: ExtractEmailsFromTextInput): Promise<ExtractEmailsFromTextOutput> {
  return extractEmailsFromTextFlow(input);
}

const extractEmailsPrompt = ai.definePrompt({
  name: 'extractEmailsFromTextPrompt',
  input: {schema: ExtractEmailsFromTextInputSchema},
  // AI model outputs candidate emails; verification happens in the flow
  output: {schema: z.object({
    extractedEmails: z.array(z.string()).describe('A list of email addresses found in the text. These will be verified separately.').default([]),
    originalTextCharacterCount: z.number().describe('The total number of characters in the original input text block.'),
    extractionSummary: z.string().describe('A brief summary of the initial extraction process before verification.'),
  })},
  prompt: `You are an email extraction specialist.
Your task is to meticulously parse the provided text block and identify all strings that appear to be email addresses.
Return only strings that look like properly formatted email addresses. Do NOT pre-filter or verify emails yourself at this stage; just find as many as possible. Verification will happen in a subsequent step.

Input Text:
{{{textBlock}}}

Based on the input text:
1. Extract all potential email addresses and list them in the 'extractedEmails' array. If no emails are found, return an empty array.
2. Calculate the total character count of the original 'textBlock' and provide it in 'originalTextCharacterCount'.
3. Provide a concise summary in 'extractionSummary', such as 'Initially extracted N email(s) from a text of Y characters.' or 'No potential email addresses found in the provided text of Y characters.' if none are found.
Ensure all output fields ('extractedEmails', 'originalTextCharacterCount', 'extractionSummary') are always populated according to the schema.
`,
});

const extractEmailsFromTextFlow = ai.defineFlow(
  {
    name: 'extractEmailsFromTextFlow',
    inputSchema: ExtractEmailsFromTextInputSchema,
    outputSchema: ExtractEmailsFromTextOutputSchema,
    tools: [validateEmailTool], // Make the tool available to this flow
  },
  async (input: ExtractEmailsFromTextInput) => {
    const llmResponse = await extractEmailsPrompt(input);
    const candidateEmails = llmResponse.output?.extractedEmails || [];
    const charCount = llmResponse.output?.originalTextCharacterCount || input.textBlock.length;
    const initialSummary = llmResponse.output?.extractionSummary || `Character count: ${charCount}.`;
    
    if (!llmResponse.output) {
        return {
            extractedEmails: [],
            originalTextCharacterCount: charCount,
            extractionSummary: `AI model failed to process the text. ${initialSummary}`,
        };
    }

    if (candidateEmails.length === 0) {
      return {
        extractedEmails: [],
        originalTextCharacterCount: charCount,
        extractionSummary: `No potential emails found to verify. ${initialSummary}`,
      };
    }

    const verifiedEmails: string[] = [];
    let validationToolError = false;

    for (const email of candidateEmails) {
      try {
        const validationResult: ValidateEmailOutput = await validateEmailTool({ email });
        if (validationResult.status === 'valid') {
          verifiedEmails.push(email);
        } else if (validationResult.status === 'error_api_key_missing' || validationResult.status === 'error_validation_failed') {
          console.warn(`Email validation skipped for ${email} due to tool error: ${validationResult.status} - ${validationResult.sub_status}`);
          validationToolError = true;
        }
      } catch (e) {
        console.error(`Error calling validateEmailTool for ${email}:`, e);
        validationToolError = true;
      }
    }

    let finalSummary = `Initially extracted ${candidateEmails.length} email(s). After ZeroBounce verification, ${verifiedEmails.length} email(s) were confirmed as valid. `;
    finalSummary += `Original text character count: ${charCount}. `;
     if (validationToolError) {
        finalSummary += `Some email validations may have been skipped due to ZeroBounce API issues (e.g., misconfigured API key or service error). Please check server logs. `;
    }


    return {
      extractedEmails: verifiedEmails,
      originalTextCharacterCount: charCount,
      extractionSummary: finalSummary,
    };
  }
);
