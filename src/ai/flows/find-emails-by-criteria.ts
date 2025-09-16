
'use server';
/**
 * @fileOverview Finds email addresses related to a given search criteria.
 * It uses an LLM to identify relevant companies and suggest generic emails.
 * It also uses Apollo.io (via a tool) to find additional emails for those domains.
 *
 * - findEmailsByCriteria - A function that handles the email finding process.
 * - FindEmailsByCriteriaInput - The input type for the findEmailsByCriteria function.
 * - FindEmailsByCriteriaOutput - The return type for the findEmailsByCriteria function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { findApolloEmailsTool, type FindApolloEmailsOutput } from '@/ai/tools/find-apollo-emails-tool';

const FindEmailsByCriteriaInputSchema = z.object({
  searchCriteria: z
    .string()
    .describe('The profession, industry, or aspect of work to search for. This can include types of people, roles, or technologies.'),
});
export type FindEmailsByCriteriaInput = z.infer<typeof FindEmailsByCriteriaInputSchema>;

const FindEmailsByCriteriaOutputSchema = z.object({
  emailAddresses: z
    .array(z.string())
    .describe('The email addresses found by the AI and/or Apollo.io. These emails are not validated.'),
  reasoning: z.string().optional().describe("Explanation of companies identified, and emails suggested by the AI and found via Apollo.io."),
});
export type FindEmailsByCriteriaOutput = z.infer<typeof FindEmailsByCriteriaOutputSchema>;

export async function findEmailsByCriteria(input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> {
  return findEmailsByCriteriaFlow(input);
}

const MAX_EMAILS_PER_DOMAIN_FROM_APOLLO = 5; 

const identifyCompaniesAndSuggestEmailsPrompt = ai.definePrompt({
  name: 'identifyCompaniesAndSuggestEmailsPrompt',
  input: {schema: FindEmailsByCriteriaInputSchema},
  output: {schema: z.object({
    companies: z.array(z.object({
      name: z.string().describe("The name of the identified company."),
      domain: z.string().describe("The primary website domain of the company (e.g., example.com)."),
      suggestedEmails: z.array(z.string()).describe("A list of plausible GENERIC, role-based email addresses suggested by the AI for this company (e.g., 'contact@', 'press@')."),
    })).describe("An extensive and diverse list of companies relevant to the search criteria, including AI-suggested generic email addresses."),
    initialReasoning: z.string().optional().describe("Brief reasoning for selecting these companies and the strategy for suggesting emails."),
  })},
  prompt:
`You are an expert research assistant specializing in lead generation using advanced web search techniques. Your goal is to generate a massive list of potential business contacts based on the given search criteria.

To achieve this, you MUST follow these instructions:
1.  **Simulate Advanced Web Search**: Act as if you are using advanced search operators (like Google dorks) to find company websites. For example, to find manufacturing companies, you would simulate searches like:
    - \`"manufacturing company" "contact us"\`
    - \`site:*.com inurl:contact "manufacturing"\`
    - \`intitle:"manufacturing" AND "contact"\`
    This will help you uncover a wide and diverse range of relevant companies.
2.  **Identify an Extensive List of Companies**: Based on your simulated search, generate an **extensive and diverse list of companies or organizations**. For each, provide its name and primary website domain (e.g., 'Google', 'google.com'). Do not limit yourself; the goal is volume and relevance.
3.  **Suggest Only Generic Emails**: For each company, suggest potential **GENERIC, ROLE-BASED email addresses only**.
    -   **ALLOWED patterns:** 'contact@', 'press@', 'hello@', 'support@', 'info@', 'sales@', 'media@', 'team@', 'jobs@', 'careers@'.
    -   **STRICTLY FORBIDDEN patterns:** Do NOT generate emails based on people's names, such as 'firstname.lastname@' or 'firstinitial.lastname@'. You MUST NOT invent or guess people's names. Your suggestions should be for company roles or departments.
4.  **Provide Reasoning**: Provide a brief 'initialReasoning' explaining your search strategy and why the selected companies are relevant.

Another tool, Apollo.io, will separately search for more specific, person-based emails for the domains you identify. Your primary task is to provide a large volume of high-quality domains for the Apollo tool to process.

Search Criteria: {{{searchCriteria}}}

List the companies in the 'companies' array, each with 'name', 'domain', and your 'suggestedEmails'.
`,
});


const findEmailsByCriteriaFlow = ai.defineFlow(
  {
    name: 'findEmailsByCriteriaFlow',
    inputSchema: FindEmailsByCriteriaInputSchema,
    outputSchema: FindEmailsByCriteriaOutputSchema,
    tools: [findApolloEmailsTool],
  },
  async (input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> => {
    let reasoningSteps = [];
    let identifiedCompanyCount = 0;
    let totalApolloEmailsFound = 0;
    let totalAISuggestedEmails = 0;
    let apolloToolErrorCount = 0;
    let apolloApiKeyIssueDetected = false;

    try {
      // Step 1: Use LLM to identify companies and suggest initial emails
      const llmResponse = await identifyCompaniesAndSuggestEmailsPrompt(input);

      if (!llmResponse.output || !llmResponse.output.companies || llmResponse.output.companies.length === 0) {
        reasoningSteps.push('LLM could not identify relevant companies or suggest emails for the search criteria.');
        return {
          emailAddresses: [],
          reasoning: reasoningSteps.join(' '),
        };
      }

      const companiesFromLLM = llmResponse.output.companies;
      identifiedCompanyCount = companiesFromLLM.length;
      reasoningSteps.push(llmResponse.output.initialReasoning || `LLM identified ${identifiedCompanyCount} companies.`);

      // Step 2: Gather AI-suggested emails and prepare for Apollo.io search
      const allPotentialEmails: string[] = [];

      companiesFromLLM.forEach(company => {
        if (company.suggestedEmails && company.suggestedEmails.length > 0) {
          allPotentialEmails.push(...company.suggestedEmails);
          totalAISuggestedEmails += company.suggestedEmails.length;
        }
      });
      reasoningSteps.push(`LLM directly suggested ${totalAISuggestedEmails} email(s).`);

      // Step 3: Use Apollo.io tool to find additional emails for these companies
      const apolloPromises = companiesFromLLM.map(company =>
        findApolloEmailsTool({ domain: company.domain, maxEmailsPerDomain: MAX_EMAILS_PER_DOMAIN_FROM_APOLLO })
          .catch(e => {
            console.error(`Critical error invoking findApolloEmailsTool for ${company.domain}:`, e);
            apolloToolErrorCount++;
            if (e instanceof Error && (e.message.toLowerCase().includes('api key') || e.message.toLowerCase().includes('unauthorized') || e.message.toLowerCase().includes('forbidden'))) {
                apolloApiKeyIssueDetected = true;
            }
            return { domain: company.domain, emails: [], error: `Tool invocation failed: ${e instanceof Error ? e.message : "Unknown tool error"}` } as FindApolloEmailsOutput;
          })
      );

      const apolloResults = await Promise.all(apolloPromises);

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

      reasoningSteps.push(`Apollo.io found an additional ${totalApolloEmailsFound} potential email(s) for ${identifiedCompanyCount > 0 ? `${identifiedCompanyCount} domain(s)` : 'the identified domains'}.`);
      if (apolloToolErrorCount > 0) {
        let apolloErrorMsg = `${apolloToolErrorCount} domain(s) encountered issues during Apollo.io email search.`;
        if (apolloApiKeyIssueDetected) {
            apolloErrorMsg += ` This may indicate an Apollo.io API key configuration problem (e.g., missing, invalid, or unauthorized key). Please verify APOLLO_API_KEY in your .env file and check server logs.`;
        } else {
            apolloErrorMsg += ` Check server logs for more details on Apollo.io tool errors.`;
        }
        reasoningSteps.push(apolloErrorMsg);
      }

      if (allPotentialEmails.length === 0) {
        reasoningSteps.push("No potential emails found from either the AI or Apollo.io.");
        return {
          emailAddresses: [],
          reasoning: reasoningSteps.join(' '),
        };
      }
      
      const filteredEmails = allPotentialEmails.filter(e => typeof e === 'string' && e.includes('@'));
      const uniquePotentialEmails = Array.from(new Set(filteredEmails.map(e => e.toLowerCase())));
      
      reasoningSteps.push(`Combined to ${uniquePotentialEmails.length} unique potential emails. No external validation was performed.`);
      reasoningSteps.push(`Displaying all ${uniquePotentialEmails.length} found email(s).`);

      return {
        emailAddresses: uniquePotentialEmails,
        reasoning: reasoningSteps.join(' '),
      };

    } catch (error) {
      console.error('CRITICAL_ERROR in findEmailsByCriteriaFlow:', error instanceof Error ? error.stack : String(error));
      reasoningSteps.push('A critical server error occurred during the find contacts process. Please check server logs or try again later.');
      return {
        emailAddresses: [],
        reasoning: reasoningSteps.join(' '),
      };
    }
  }
);
