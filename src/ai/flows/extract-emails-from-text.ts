
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
    tools: [validateEmailTool],
  },
  async (input: ExtractEmailsFromTextInput): Promise<ExtractEmailsFromTextOutput> => {
    try {
      const llmResponse = await extractEmailsPrompt(input);
      
      // Fallback values if llmResponse.output or its properties are undefined
      const fallbackCharCount = input.textBlock.length;
      const fallbackInitialSummary = `Character count: ${fallbackCharCount}.`;

      if (!llmResponse.output) {
          console.warn('AI model did not return an output for extractEmailsFromTextPrompt.');
          return {
              extractedEmails: [],
              originalTextCharacterCount: fallbackCharCount,
              extractionSummary: `AI model failed to process the text. ${fallbackInitialSummary}`,
          };
      }

      const candidateEmails = llmResponse.output.extractedEmails || [];
      const charCount = llmResponse.output.originalTextCharacterCount === undefined || llmResponse.output.originalTextCharacterCount === null 
                        ? fallbackCharCount 
                        : llmResponse.output.originalTextCharacterCount;
      const initialSummary = llmResponse.output.extractionSummary || fallbackInitialSummary;
      
      if (candidateEmails.length === 0) {
        return {
          extractedEmails: [],
          originalTextCharacterCount: charCount,
          extractionSummary: `No potential emails found to verify. ${initialSummary}`,
        };
      }

      const verifiedEmails: string[] = [];
      let validationToolError = false;
      const validatedEmailResults: ValidateEmailOutput[] = [];
      const CHUNK_SIZE = 10; // Process 10 emails concurrently

      for (let i = 0; i < candidateEmails.length; i += CHUNK_SIZE) {
        const chunk = candidateEmails.slice(i, i + CHUNK_SIZE);
        const validationPromises = chunk.map(email =>
          validateEmailTool({ email })
            .catch(e => {
              console.error(`Critical error during validateEmailTool call for ${email}:`, e);
              return {
                email: email,
                status: 'error_tool_invocation_failed',
                sub_status: e instanceof Error ? e.message : 'unknown_tool_error',
              } as ValidateEmailOutput;
            })
        );
        try {
          const chunkResults = await Promise.all(validationPromises);
          validatedEmailResults.push(...chunkResults);
        } catch (e) {
          console.error('Error processing a chunk of email validations:', e);
          validationToolError = true;
        }
      }

      for (const result of validatedEmailResults) {
        if (result.status === 'valid') {
          verifiedEmails.push(result.email);
        } else if (
          result.status === 'error_api_key_missing' ||
          result.status === 'error_validation_failed' ||
          result.status === 'error_tool_invocation_failed'
        ) {
          console.warn(`Email validation for ${result.email} resulted in status '${result.status}': ${result.sub_status}`);
          validationToolError = true;
        }
        // Other statuses (invalid, catch-all, unknown, etc.) are silently ignored
      }

      let finalSummary = `Initially extracted ${candidateEmails.length} email(s). After ZeroBounce verification, ${verifiedEmails.length} email(s) were confirmed as valid. `;
      finalSummary += `Original text character count: ${charCount}. `;
      if (validationToolError) {
          finalSummary += `Some email validations may have been skipped or failed due to ZeroBounce API issues (e.g., misconfigured API key, service error, or tool invocation problem). Please check server logs. `;
      }

      return {
        extractedEmails: verifiedEmails,
        originalTextCharacterCount: charCount,
        extractionSummary: finalSummary,
      };
    } catch (error) {
      console.error('Unexpected error in extractEmailsFromTextFlow:', error);
      return {
        extractedEmails: [],
        originalTextCharacterCount: input.textBlock.length,
        extractionSummary: `An unexpected error occurred while extracting emails: ${error instanceof Error ? error.message : 'Unknown error'}. Please check server logs.`,
      };
    }
  }
);
