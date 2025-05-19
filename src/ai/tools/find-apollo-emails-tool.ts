
/**
 * @fileOverview Genkit tool for finding email addresses using Apollo.io.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { fetchEmailsFromApollo } from '@/services/apollo';

export const FindApolloEmailsInputSchema = z.object({
  domain: z.string().describe('The company domain to search for emails (e.g., example.com).'),
  maxEmailsPerDomain: z.number().optional().default(5).describe('Maximum number of emails to try and fetch for this domain.'),
});
export type FindApolloEmailsInput = z.infer<typeof FindApolloEmailsInputSchema>;

export const FindApolloEmailsOutputSchema = z.object({
  domain: z.string(),
  emails: z.array(z.string()).describe('A list of email addresses (or strings that look like emails) found for the domain. These will be validated separately by NeverBounce.'),
  error: z.string().optional().describe('Any error message if the search failed.'),
});
export type FindApolloEmailsOutput = z.infer<typeof FindApolloEmailsOutputSchema>;

export const findApolloEmailsTool = ai.defineTool(
  {
    name: 'findEmailsWithApollo',
    description: 'Finds email addresses for a given company domain using the Apollo.io API.',
    inputSchema: FindApolloEmailsInputSchema,
    outputSchema: FindApolloEmailsOutputSchema,
  },
  async (input: FindApolloEmailsInput): Promise<FindApolloEmailsOutput> => {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
      console.error('APOLLO_API_KEY environment variable is not set.');
      return {
        domain: input.domain,
        emails: [],
        error: 'Apollo.io API key is not configured on the server.',
      };
    }

    try {
      const emails = await fetchEmailsFromApollo({
        domain: input.domain,
        apiKey,
        maxEmailsPerDomain: input.maxEmailsPerDomain
      });
      
      return {
        domain: input.domain,
        emails: emails,
      };
    } catch (error) {
      console.error(`Error finding emails for domain ${input.domain} with Apollo.io tool:`, error);
      return {
        domain: input.domain,
        emails: [],
        error: error instanceof Error ? error.message : 'Unknown error invoking Apollo.io tool.',
      };
    }
  }
);
