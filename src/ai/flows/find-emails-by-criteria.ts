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
  reasoning: z.string().optional().describe("Explanation of the companies and email addresses found related to the search criteria. Include how many emails were found and if the target of 500-1000+ was met, explain limitations if it wasn't."),
});
export type FindEmailsByCriteriaOutput = z.infer<typeof FindEmailsByCriteriaOutputSchema>;

export async function findEmailsByCriteria(input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> {
  return findEmailsByCriteriaFlow(input);
}

const findEmailsByCriteriaPrompt = ai.definePrompt({
  name: 'findEmailsByCriteriaPrompt',
  input: {schema: FindEmailsByCriteriaInputSchema},
  output: {schema: FindEmailsByCriteriaOutputSchema},
  prompt: `You are an expert research assistant. Your mission is to compile an extensive list of publicly listed email addresses, targeting **at least 500, and ideally over 1000**, contacts from a wide and diverse array of companies relevant to the given search criteria.

Search Criteria: {{{searchCriteria}}}

Your process should be:
1. Identify a large and diverse set of companies that are highly relevant to the 'searchCriteria'. Do not limit yourself to a few companies; explore broadly.
2. For each identified company, diligently search for multiple publicly available contact email addresses (e.g., general contact, sales, marketing, HR, support, specific departments).
3. Compile all found email addresses into a single, flat list in the 'emailAddresses' field.
4. In the 'reasoning' field, provide:
    - A summary of the types of companies and roles targeted.
    - An acknowledgement of the number of email addresses found.
    - If the target of 500-1000+ emails was not met, explain the limitations encountered (e.g., scarcity of publicly available information for the specific criteria, niche industry).

Strive to maximize the number of unique, valid, and publicly listed email addresses. The goal is quantity and breadth, while maintaining relevance to the search criteria. Ensure all email addresses are correctly formatted.
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

