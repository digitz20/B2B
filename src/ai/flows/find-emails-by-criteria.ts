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
  reasoning: z.string().optional().describe('Explanation of the companies and email addresses found related to the search criteria.'),
});
export type FindEmailsByCriteriaOutput = z.infer<typeof FindEmailsByCriteriaOutputSchema>;

export async function findEmailsByCriteria(input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> {
  return findEmailsByCriteriaFlow(input);
}

const findEmailsByCriteriaPrompt = ai.definePrompt({
  name: 'findEmailsByCriteriaPrompt',
  input: {schema: FindEmailsByCriteriaInputSchema},
  output: {schema: FindEmailsByCriteriaOutputSchema},
  prompt: `You are an expert research assistant. Your task is to find a comprehensive list of publicly listed email addresses for a diverse range of companies related to a given search criteria (e.g., profession, industry, or work aspect).

Search Criteria: {{{searchCriteria}}}

Based on this, identify several relevant companies, aiming for variety. Then, for each company, find one or more potential contact email addresses.
Prioritize finding multiple contacts if possible.
Return all found email addresses as a flat list in the 'emailAddresses' field. Aim for a substantial number of contacts.
In the 'reasoning' field, provide a summary explaining which companies the emails belong to, how they are relevant to the search_criteria, and any limitations encountered. If no emails are found for certain companies or overall, explain why.
Ensure the email addresses are valid and properly formatted.
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
