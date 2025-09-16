
'use server';
/**
 * @fileOverview Extracts email addresses from a given block of text and performs validation using NeverBounce.
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
  extractedEmails: z.array(z.string().describe("An email address extracted from the text that was determined to be 'valid' by the NeverBounce validation service.")).describe('A list of valid email addresses extracted and verified from the input text.').default([]),
  originalTextCharacterCount: z.number().describe('The total number of characters in the original input text block.'),
  extractionSummary: z.string().describe('A brief summary of the extraction and validation process, e.g., "Extracted X email(s), Y were validated as \'valid\' by NeverBounce, from a text of Z characters."'),
});
export type ExtractEmailsFromTextOutput = z.infer<typeof ExtractEmailsFromTextOutputSchema>;

export async function extractEmailsFromText(input: ExtractEmailsFromTextInput): Promise<ExtractEmailsFromTextOutput> {
  return extractEmailsFromTextFlow(input);
}

const extractEmailsPrompt = ai.definePrompt({
  name: 'extractEmailsFromTextPrompt',
  input: {schema: ExtractEmailsFromTextInputSchema},
  output: {schema: z.object({
    extractedEmails: z.array(z.string()).describe('A list of email addresses found in the text. These will undergo validation by NeverBounce.').default([]),
    originalTextCharacterCount: z.number().optional().describe('The total number of characters in the original input text block.'),
    extractionSummary: z.string().optional().describe('A brief summary of the initial extraction process before validation.'),
  })},
  prompt: `You are an email extraction specialist.
Your task is to meticulously parse the provided text block and identify all strings that appear to be email addresses.
Return all strings that look like email addresses. A separate validation step will determine their deliverability.

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
      
      const fallbackCharCount = input?.textBlock?.length || 0;
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
          extractionSummary: `No potential emails found to validate. ${initialSummary}`,
        };
      }

      const verifiedEmails: string[] = [];
      let validationToolErrorCount = 0;
      let neverBounceApiKeyIssueDetected = false;
      const validatedEmailResults: ValidateEmailOutput[] = [];
      const CHUNK_SIZE = 10; 

      for (let i = 0; i < candidateEmails.length; i += CHUNK_SIZE) {
        const chunk = candidateEmails.slice(i, i + CHUNK_SIZE);
        const validationPromises = chunk.map(email =>
          validateEmailTool({ email })
            .catch(e => {
              console.error(`Critical error during validateEmailTool call for ${email}:`, e);
              validationToolErrorCount++;
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
          validationToolErrorCount++;
        }
      }

      for (const result of validatedEmailResults) {
        if (result.status === 'valid' && result.email) {
          verifiedEmails.push(result.email);
        } else {
            if (result.status === 'error_api_key_missing') {
                neverBounceApiKeyIssueDetected = true;
            }
            if (result.email) {
                console.warn(`Email validation for ${result.email} resulted in status '${result.status}': ${result.sub_status}`);
            }
        }
      }

      let finalSummary = `Initially extracted ${candidateEmails.length} email(s). After validation, ${verifiedEmails.length} email(s) were confirmed as 'valid'. `;
      finalSummary += `Original text character count: ${charCount}. `;
      if (neverBounceApiKeyIssueDetected) {
          finalSummary += `Some validations may have failed due to a NeverBounce API key configuration problem. Please check your .env file and server logs. `;
      } else if (validationToolErrorCount > 0) {
          finalSummary += `Some emails may have encountered errors during the validation tool invocation. Please check server logs. `;
      }


      return {
        extractedEmails: verifiedEmails,
        originalTextCharacterCount: charCount,
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
