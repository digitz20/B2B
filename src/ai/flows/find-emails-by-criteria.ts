
'use server';
/**
 * @fileOverview Finds email addresses for companies related to a given search criteria (profession, industry, or work aspect).
 *
 * - findEmailsByCriteria - A function that handles the email finding process.
 * - FindEmailsByCriteriaInput - The input type for the findEmailsByCriteria function.
 * - FindEmailsByCriteriaOutput - The return type for the findEmailsByCriteria function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FindEmailsByCriteriaInputSchema = z.object({
  searchCriteria: z
    .string()
    .describe('The profession, industry, or aspect of work to search for email addresses.'),
});
export type FindEmailsByCriteriaInput = z.infer<typeof FindEmailsByCriteriaInputSchema>;

const FindEmailsByCriteriaOutputSchema = z.object({
  emailAddresses: z
    .array(z.string())
    .describe('The extracted email addresses. Each string should be a valid email format.'),
  reasoning: z.string().optional().describe("Explanation of the companies and email addresses found related to the search criteria. Include how many emails were found and if the target of 1000+ was met, explain limitations or how breadth was achieved if it wasn't."),
});
export type FindEmailsByCriteriaOutput = z.infer<typeof FindEmailsByCriteriaOutputSchema>;

export async function findEmailsByCriteria(input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> {
  return findEmailsByCriteriaFlow(input);
}

const findEmailsByCriteriaPrompt = ai.definePrompt({
  name: 'findEmailsByCriteriaPrompt',
  input: {schema: FindEmailsByCriteriaInputSchema},
  output: {schema: FindEmailsByCriteriaOutputSchema},
  prompt: `You are an expert research assistant. Your mission is to compile an exceptionally large and diverse list of publicly listed email addresses, targeting **well over 1000 contacts**, and as many as possible, relevant to the given search criteria.

Search Criteria: {{{searchCriteria}}}

Your process should be:
1.  **Think Expansively**: Identify a very large and diverse set of companies highly relevant to the 'searchCriteria'. Do not limit yourself to obvious matches. If the core criteria is narrow, explore broadly into related, adjacent, or supporting industries and roles that would still be valuable to someone interested in the 'searchCriteria'. The goal is to maximize the number of potential contacts.
2.  **Exhaustive Email Search**: For each identified company, diligently search for multiple publicly available contact email addresses (e.g., general contact, sales, marketing, HR, support, specific departments, and individuals if appropriate and publicly listed).
3.  **Compile Results**: Compile all found email addresses into a single, flat list in the 'emailAddresses' field.
4.  **Detailed Reasoning**: In the 'reasoning' field, provide:
    *   A summary of the types of companies and roles targeted.
    *   If the 'searchCriteria' was narrow, explain how you broadened the search to related or adjacent fields to achieve a high volume of contacts.
    *   An acknowledgement of the number of email addresses found.
    *   If the target of 1000+ emails was not met, explain the primary limitations encountered (e.g., genuine scarcity of publicly available information for the specific criteria even after broadening, niche industry).

Strive to maximize the number of unique, valid, and publicly listed email addresses. The goal is **maximum quantity and breadth**, while maintaining a reasonable degree of relevance to the search criteria, including related fields. Ensure all email addresses are correctly formatted.
  `,
});

const findEmailsByCriteriaFlow = ai.defineFlow(
  {
    name: 'findEmailsByCriteriaFlow',
    inputSchema: FindEmailsByCriteriaInputSchema,
    outputSchema: FindEmailsByCriteriaOutputSchema,
  },
  async input => {
    const {output} = await findEmailsByCriteriaPrompt(input);
    return output!;
  }
);

