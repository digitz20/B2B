
'use server';
/**
 * @fileOverview Finds email addresses for companies and individuals related to a given search criteria (profession, industry, or work aspect),
 * and validates them using ZeroBounce.
 *
 * - findEmailsByCriteria - A function that handles the email finding and validation process.
 * - FindEmailsByCriteriaInput - The input type for the findEmailsByCriteria function.
 * - FindEmailsByCriteriaOutput - The return type for the findEmailsByCriteria function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { validateEmailTool, type ValidateEmailOutput } from '@/ai/tools/validate-email-tool';

const FindEmailsByCriteriaInputSchema = z.object({
  searchCriteria: z
    .string()
    .describe('The profession, industry, or aspect of work to search for email addresses.'),
});
export type FindEmailsByCriteriaInput = z.infer<typeof FindEmailsByCriteriaInputSchema>;

const FindEmailsByCriteriaOutputSchema = z.object({
  emailAddresses: z
    .array(z.string())
    .describe('The VERIFIED email addresses. Each string should be a valid email format.'),
  reasoning: z.string().optional().describe("Explanation of the companies, individuals, and email addresses found related to the search criteria. Includes how many initial emails were found, how many were verified by ZeroBounce, and if the target of 1000+ was met, explain limitations or how breadth was achieved if it wasn't."),
});
export type FindEmailsByCriteriaOutput = z.infer<typeof FindEmailsByCriteriaOutputSchema>;

export async function findEmailsByCriteria(input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> {
  return findEmailsByCriteriaFlow(input);
}

const findEmailsByCriteriaPrompt = ai.definePrompt({
  name: 'findEmailsByCriteriaPrompt',
  input: {schema: FindEmailsByCriteriaInputSchema},
  output: {schema: z.object({
    emailAddresses: z.array(z.string()).describe('A large list of potential email addresses found. These will be verified separately.'),
    reasoning: z.string().optional().describe("Initial reasoning before verification."),
  })},
  prompt: `You are an expert research assistant. Your mission is to compile an exceptionally large and diverse list of publicly listed email addresses, targeting **well over 1000 contacts**, and as many as possible, relevant to the given search criteria.

Search Criteria: {{{searchCriteria}}}

Your process should be:
1.  **Think Expansively**: Identify a very large and diverse set of companies **and individual professionals** highly relevant to the 'searchCriteria'. Do not limit yourself to obvious matches. If the core criteria is narrow, explore broadly into related, adjacent, or supporting industries, roles, and professional communities (including online forums, professional social media profiles where emails are publicly listed such as LinkedIn, public directories, and personal portfolio websites) that would still be valuable to someone interested in the 'searchCriteria'. Consider less direct but still plausible connections if it helps to achieve the volume target. The goal is to maximize the number of potential contacts.
2.  **Exhaustive Email Search**: For each identified company or individual professional, diligently search for multiple publicly available contact email addresses. This can include:
    *   Business email addresses (e.g., \`name@company.com\`, \`info@company.com\`, \`sales@department.com\`).
    *   Personal-style email addresses (e.g., from providers like Gmail, Outlook.com, Yahoo, etc.) **only if they are publicly listed by individuals in direct relation to their professional activities, services, or public profile (like a personal website, portfolio, or professional social media page where the email is openly shared) relevant to the search criteria.** Do not invent or assume personal emails.
3.  **Compile Results**: Compile all found, publicly listed email addresses into a single, flat list in the 'emailAddresses' field.
4.  **Initial Reasoning**: In the 'reasoning' field, provide:
    *   A summary of the types of companies, roles, and individuals targeted, and the types of sources considered (e.g., company websites, professional directories, public social media profiles where emails are openly shared).
    *   If the 'searchCriteria' was narrow, explain how you broadened the search to related or adjacent fields/professions to achieve a high volume of contacts.
    *   An acknowledgement of the number of email addresses found.
    *   If the target of 1000+ emails was met, explain how such breadth was achieved.
    *   If the target of 1000+ emails was not met, explain the primary limitations encountered (e.g., genuine scarcity of publicly available information for the specific criteria even after broadening, niche industry).

Strive to maximize the number of unique, valid, and **publicly listed** email addresses. The goal is **maximum quantity and breadth**, while maintaining a reasonable degree of relevance to the search criteria, including related fields. Ensure all email addresses are correctly formatted. Do NOT pre-filter or verify emails yourself at this stage; just find as many as possible. Verification will happen in a subsequent step.
  `,
});

const findEmailsByCriteriaFlow = ai.defineFlow(
  {
    name: 'findEmailsByCriteriaFlow',
    inputSchema: FindEmailsByCriteriaInputSchema,
    outputSchema: FindEmailsByCriteriaOutputSchema,
    tools: [validateEmailTool],
  },
  async (input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> => {
    try {
      const llmResponse = await findEmailsByCriteriaPrompt(input);
      
      if (!llmResponse.output) {
        console.warn('AI model did not return an output for findEmailsByCriteriaPrompt.');
        return {
          emailAddresses: [],
          reasoning: 'AI model failed to generate an initial list of emails. Please try a different search criteria or try again later.',
        };
      }

      const candidateEmails = llmResponse.output.emailAddresses || [];
      const initialReasoning = llmResponse.output.reasoning || "No initial reasoning provided by AI.";

      if (candidateEmails.length === 0) {
        return {
          emailAddresses: [],
          reasoning: `${initialReasoning} No candidate emails were found by the AI to verify.`,
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
      
      let finalReasoning = `${initialReasoning} Found ${candidateEmails.length} potential email(s). `;
      finalReasoning += `After ZeroBounce verification, ${verifiedEmails.length} email(s) were confirmed as valid. `;
      if (validationToolError) {
          finalReasoning += `Some email validations may have been skipped or failed due to ZeroBounce API issues (e.g., misconfigured API key, service error, or tool invocation problem). Please check server logs for details. `;
      }

      return {
        emailAddresses: verifiedEmails,
        reasoning: finalReasoning,
      };
    } catch (error) {
      console.error('CRITICAL_ERROR in findEmailsByCriteriaFlow:', error instanceof Error ? error.stack : String(error));
      return {
        emailAddresses: [],
        reasoning: 'A critical server error occurred. Please check server logs or try again later.',
      };
    }
  }
);
