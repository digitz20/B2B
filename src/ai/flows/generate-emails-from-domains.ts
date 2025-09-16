
'use server';
/**
 * @fileOverview Extracts domains from a block of text containing websites/domains and finds potential email addresses for them.
 * It uses the Apollo.io tool to find contacts and also suggests generic emails.
 *
 * - generateEmailsFromDomains - A function that handles the email generation process.
 * - GenerateEmailsFromDomainsInput - The input type for the function.
 * - GenerateEmailsFromDomainsOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { findApolloEmailsTool, type FindApolloEmailsOutput } from '@/ai/tools/find-apollo-emails-tool';

const GenerateEmailsFromDomainsInputSchema = z.object({
  textBlock: z.string().describe('A block of text containing company websites or domains (e.g., https://www.uber.com, example.com).'),
});
export type GenerateEmailsFromDomainsInput = z.infer<typeof GenerateEmailsFromDomainsInputSchema>;

const GenerateEmailsFromDomainsOutputSchema = z.object({
  processedEmails: z.array(z.string()).describe('A list of found and suggested email addresses.'),
  generationSummary: z.string().describe('A summary of the domains processed and the emails found.'),
});
export type GenerateEmailsFromDomainsOutput = z.infer<typeof GenerateEmailsFromDomainsOutputSchema>;

export async function generateEmailsFromDomains(input: GenerateEmailsFromDomainsInput): Promise<GenerateEmailsFromDomainsOutput> {
  return generateEmailsFromDomainsFlow(input);
}

const MAX_EMAILS_PER_DOMAIN_FROM_APOLLO = 5;

const extractDomainsPrompt = ai.definePrompt({
  name: 'extractDomainsFromTextPrompt',
  input: {schema: GenerateEmailsFromDomainsInputSchema},
  output: {schema: z.object({
    domains: z.array(z.string().describe("A domain name extracted from the text.")).describe("A list of unique domain names extracted from the input text.").default([]),
  })},
  prompt: `You are an expert at parsing text to find company domain names from website URLs or domains.
From the provided text block, extract all unique, valid-looking top-level domain names (e.g., example.com, company.co.uk).
For a URL like 'https://www.example.com/about', you should extract 'example.com'.
Ignore any subdomains (like app.example.com) and return only the root domain.
Return the list of unique domains in the 'domains' array.

Input Text:
{{{textBlock}}}
`,
});

const generateEmailsFromDomainsFlow = ai.defineFlow(
  {
    name: 'generateEmailsFromDomainsFlow',
    inputSchema: GenerateEmailsFromDomainsInputSchema,
    outputSchema: GenerateEmailsFromDomainsOutputSchema,
    tools: [findApolloEmailsTool],
  },
  async (input: GenerateEmailsFromDomainsInput): Promise<GenerateEmailsFromDomainsOutput> => {
    let summarySteps = [];
    let apolloToolErrorCount = 0;
    let apolloApiKeyIssueDetected = false;

    try {
      // Step 1: Use LLM to extract domains from the text block.
      const domainExtractionResponse = await extractDomainsPrompt(input);
      const domains = domainExtractionResponse.output?.domains ?? [];

      if (domains.length === 0) {
        return {
          processedEmails: [],
          generationSummary: 'No valid domain names could be extracted from the provided text.',
        };
      }
      summarySteps.push(`Extracted ${domains.length} unique domain(s) from the text.`);

      const allPotentialEmails: string[] = [];

      // Step 2: Suggest a few generic emails for each domain.
      const genericSuggestions = domains.flatMap(domain => 
        ['contact@', 'info@', 'support@', 'sales@'].map(prefix => prefix + domain)
      );
      allPotentialEmails.push(...genericSuggestions);
      summarySteps.push(`Suggested ${genericSuggestions.length} generic emails.`);

      // Step 3: Use Apollo.io tool to find specific emails for each domain.
      const apolloPromises = domains.map(domain =>
        findApolloEmailsTool({ domain: domain, maxEmailsPerDomain: MAX_EMAILS_PER_DOMAIN_FROM_APOLLO })
          .catch(e => {
            console.error(`Critical error invoking findApolloEmailsTool for ${domain}:`, e);
            apolloToolErrorCount++;
            if (e instanceof Error && (e.message.toLowerCase().includes('api key') || e.message.toLowerCase().includes('unauthorized') || e.message.toLowerCase().includes('forbidden'))) {
                apolloApiKeyIssueDetected = true;
            }
            return { domain, emails: [], error: `Tool invocation failed: ${e instanceof Error ? e.message : "Unknown tool error"}` } as FindApolloEmailsOutput;
          })
      );
      
      const apolloResults = await Promise.all(apolloPromises);

      let totalApolloEmailsFound = 0;
      apolloResults.forEach(result => {
        if (result && result.emails && Array.isArray(result.emails) && result.emails.length > 0) {
            allPotentialEmails.push(...result.emails.filter(e => typeof e === 'string' && e));
            totalApolloEmailsFound += result.emails.length;
        }
        if (result.error) {
            apolloToolErrorCount++;
            console.warn(`Apollo.io tool for domain ${result.domain} reported error: ${result.error}`);
            const lowerError = result.error.toLowerCase();
            if (lowerError.includes('api key') || lowerError.includes('unconfigured') || lowerError.includes('unauthorized') || lowerError.includes('forbidden')) {
                apolloApiKeyIssueDetected = true;
            }
        }
      });
      summarySteps.push(`Apollo.io found an additional ${totalApolloEmailsFound} email(s).`);
      
      if (apolloToolErrorCount > 0) {
        let apolloErrorMsg = `${apolloToolErrorCount} domain(s) encountered issues during Apollo.io email search.`;
        if (apolloApiKeyIssueDetected) {
            apolloErrorMsg += ` This may indicate an Apollo.io API key configuration problem. Please verify APOLLO_API_KEY in your .env file.`;
        }
        summarySteps.push(apolloErrorMsg);
      }

      const filteredEmails = allPotentialEmails.filter(e => typeof e === 'string' && e.includes('@'));
      const uniqueEmails = Array.from(new Set(filteredEmails.map(e => e.toLowerCase())));

      summarySteps.push(`Total unique potential emails found: ${uniqueEmails.length}. No external validation was performed.`);

      return {
        processedEmails: uniqueEmails,
        generationSummary: summarySteps.join(' '),
      };

    } catch (error) {
      console.error('CRITICAL_ERROR in generateEmailsFromDomainsFlow:', error instanceof Error ? error.stack : String(error));
      return {
        processedEmails: [],
        generationSummary: 'A critical server error occurred. Please check server logs or try again later.',
      };
    }
  }
);
