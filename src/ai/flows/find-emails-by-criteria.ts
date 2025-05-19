
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
  // The AI model will still output a broader list, verification happens in the flow
  output: {schema: z.object({
    emailAddresses: z.array(z.string()).describe('A large list of potential email addresses found. These will be verified separately.'),
    reasoning: z.string().optional().describe("Initial reasoning before verification."),
  })},
  prompt: `You are an expert research assistant. Your mission is to compile an exceptionally large and diverse list of publicly listed email addresses, targeting **well over 1000 contacts**, and as many as possible, relevant to the given search criteria.

Search Criteria: {{{searchCriteria}}}

Your process should be:
1.  **Think Expansively**: Identify a very large and diverse set of companies **and individual professionals** highly relevant to the 'searchCriteria'. Do not limit yourself to obvious matches. If the core criteria is narrow, explore broadly into related, adjacent, or supporting industries, roles, and professional communities (including online forums, professional social media profiles where emails are publicly listed, and public directories) that would still be valuable to someone interested in the 'searchCriteria'. Consider less direct but still plausible connections if it helps to achieve the volume target. The goal is to maximize the number of potential contacts.
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
    tools: [validateEmailTool], // Make the tool available to this flow
  },
  async (input: FindEmailsByCriteriaInput) => {
    const llmResponse = await findEmailsByCriteriaPrompt(input);
    const candidateEmails = llmResponse.output?.emailAddresses || [];
    const initialReasoning = llmResponse.output?.reasoning || "No initial reasoning provided.";

    if (candidateEmails.length === 0) {
      return {
        emailAddresses: [],
        reasoning: `${initialReasoning} No candidate emails were found by the AI to verify.`,
      };
    }

    const verifiedEmails: string[] = [];
    let validationToolError = false;

    // Sequentially validate to avoid hitting rate limits too quickly with Promise.all
    // For a production app with many emails, consider batching and/or a queue.
    for (const email of candidateEmails) {
      try {
        const validationResult: ValidateEmailOutput = await validateEmailTool({ email });
        if (validationResult.status === 'valid') {
          verifiedEmails.push(email);
        } else if (validationResult.status === 'error_api_key_missing' || validationResult.status === 'error_validation_failed') {
          console.warn(`Email validation skipped for ${email} due to tool error: ${validationResult.status} - ${validationResult.sub_status}`);
          // Potentially add unverified email if tool fails, or skip. For now, skip.
          validationToolError = true; // Mark that an error occurred with the tool
        }
      } catch (e) {
        console.error(`Error calling validateEmailTool for ${email}:`, e);
        validationToolError = true;
      }
    }
    
    let finalReasoning = `${initialReasoning} Found ${candidateEmails.length} potential email(s). `;
    finalReasoning += `After ZeroBounce verification, ${verifiedEmails.length} email(s) were confirmed as valid. `;
    if (validationToolError) {
        finalReasoning += `Some email validations may have been skipped due to ZeroBounce API issues (e.g., misconfigured API key or service error). Please check server logs. `;
    }


    return {
      emailAddresses: verifiedEmails,
      reasoning: finalReasoning,
    };
  }
);
