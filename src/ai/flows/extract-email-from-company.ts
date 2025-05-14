'use server';
/**
 * @fileOverview Extracts email addresses associated with a company name or website URL.
 *
 * - extractEmailFromCompany - A function that handles the email extraction process.
 * - ExtractEmailFromCompanyInput - The input type for the extractEmailFromCompany function.
 * - ExtractEmailFromCompanyOutput - The return type for the extractEmailFromCompany function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractEmailFromCompanyInputSchema = z.object({
  companyInfo: z
    .string()
    .describe('The company name or website URL to extract email addresses from.'),
});
export type ExtractEmailFromCompanyInput = z.infer<typeof ExtractEmailFromCompanyInputSchema>;

const ExtractEmailFromCompanyOutputSchema = z.object({
  emailAddresses: z
    .array(z.string().email())
    .describe('The extracted email addresses associated with the company.'),
  reasoning: z.string().optional().describe('The reasoning behind the extracted emails.'),
});
export type ExtractEmailFromCompanyOutput = z.infer<typeof ExtractEmailFromCompanyOutputSchema>;

export async function extractEmailFromCompany(input: ExtractEmailFromCompanyInput): Promise<ExtractEmailFromCompanyOutput> {
  return extractEmailFromCompanyFlow(input);
}

const extractEmailPrompt = ai.definePrompt({
  name: 'extractEmailPrompt',
  input: {schema: ExtractEmailFromCompanyInputSchema},
  output: {schema: ExtractEmailFromCompanyOutputSchema},
  prompt: `You are an expert at finding email addresses associated with a company.

  Given the following company information, extract all valid email addresses associated with the company. If no email addresses are found, return an empty array. Explain your reasoning in the reasoning field.

  Company Information: {{{companyInfo}}}

  Ensure the email addresses are valid and properly formatted.
  Return the email addresses in the emailAddresses field.
  `,
});

const extractEmailFromCompanyFlow = ai.defineFlow(
  {
    name: 'extractEmailFromCompanyFlow',
    inputSchema: ExtractEmailFromCompanyInputSchema,
    outputSchema: ExtractEmailFromCompanyOutputSchema,
  },
  async input => {
    const {output} = await extractEmailPrompt(input);
    return output!;
  }
);
