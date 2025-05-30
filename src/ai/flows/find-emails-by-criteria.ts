
'use server';
/**
 * @fileOverview Finds email addresses related to a given search criteria.
 * It uses an LLM to identify relevant company domains and suggest initial emails.
 * Then, it uses Apollo.io (via a tool) to find additional emails for those domains.
 * Finally, it performs a basic format check on all found emails.
 *
 * - findEmailsByCriteria - A function that handles the email finding and validation process.
 * - FindEmailsByCriteriaInput - The input type for the findEmailsByCriteria function.
 * - FindEmailsByCriteriaOutput - The return type for the findEmailsByCriteria function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { validateEmailTool, type ValidateEmailOutput } from '@/ai/tools/validate-email-tool';
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
    .describe('The email addresses found after a basic format check. Each string should resemble an email format.'),
  reasoning: z.string().optional().describe("Explanation of companies identified, emails suggested by AI, emails found via Apollo.io, and basic format check results."),
});
export type FindEmailsByCriteriaOutput = z.infer<typeof FindEmailsByCriteriaOutputSchema>;

export async function findEmailsByCriteria(input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> {
  return findEmailsByCriteriaFlow(input);
}

const MAX_EMAILS_PER_DOMAIN_FROM_APOLLO = 5; // Max emails to fetch per domain from Apollo.io

const identifyCompaniesAndSuggestEmailsPrompt = ai.definePrompt({
  name: 'identifyCompaniesAndSuggestEmailsPrompt',
  input: {schema: FindEmailsByCriteriaInputSchema},
  output: {schema: z.object({
    companies: z.array(z.object({
      name: z.string().describe("The name of the identified company."),
      domain: z.string().describe("The primary website domain of the company (e.g., example.com)."),
      suggestedEmails: z.array(z.string()).describe("Email addresses (or strings that look like emails) directly suggested by the AI for this company based on public information or common patterns. These will undergo a basic format check.").default([]),
    })).describe("An extensive and diverse list of companies/organizations relevant to the search criteria. For each, also suggest potential email addresses if possible."),
    initialReasoning: z.string().optional().describe("Brief reasoning for selecting these companies and suggesting initial emails based on the search criteria, and strategy to meet the high volume target."),
  })},
  prompt:
`You are an expert research assistant. Your primary goal is to generate an exceptionally large list of potential email contacts (aiming for well over 1000 if the criteria allow) based on the given search criteria. Your success is measured by the sheer volume of relevant leads you can uncover.

To achieve this, you MUST:
1.  Identify an **extensive and diverse list of companies or organizations** highly relevant to the search criteria. For each, provide its name and primary website domain (e.g., 'Google', 'google.com'). Focus on entities where business contact information is likely publicly discoverable. **Maximize the number of relevant company domains you identify**, as this directly impacts the potential to reach the 1000+ contact goal via the Apollo.io tool (detailed below).
2.  For each identified company, **directly suggest as many potential email addresses** (or strings that look like email addresses) as reasonably possible. These can be generic (contact@, info@, sales@, support@, careers@, press@, media@) or based on common patterns if individual names are discoverable (firstname.lastname@domain.com, f.lastname@domain.com, firstinitial.lastname@domain.com).
3.  Provide a brief 'initialReasoning' explaining your strategy for company selection and email suggestion specifically addressing **how you plan to meet (or exceed) the high volume target of 1000+ contacts**.

Search Criteria: {{{searchCriteria}}}

List the companies in the 'companies' array, each with 'name', 'domain', and 'suggestedEmails'.
The company domains you provide are CRITICAL. They will be used by an automated tool (like Apollo.io) which can find up to ${MAX_EMAILS_PER_DOMAIN_FROM_APOLLO} additional emails per domain. Therefore, the combination of your direct email suggestions AND the *sheer number of unique, relevant domains you list* for the Apollo.io search is paramount to achieving the 1000+ potential contact target.
Think expansively: if the initial criteria are narrow, you MUST broaden your search to related and adjacent industries or roles to maximize results. Clearly state in your reasoning if and how you broadened the search.
Include various types of publicly listed email addresses, such as generic company contacts, and emails of individuals associated with these companies if publicly available (e.g., on company websites, public professional directories, professional social media pages where emails are openly shared, relevant online forums, personal websites, or professional portfolios). Personal-style email addresses (e.g., from providers like Gmail, Outlook.com, Yahoo, etc.) should be included if they are publicly listed by individuals in direct relation to their professional activities, services, or public profile relevant to the search criteria.
In your reasoning, explicitly state why you believe the number of domains and direct suggestions you've provided is sufficient (or your best attempt) for potentially reaching the 1000+ contact goal, detailing the breadth of your company search.
`,
});


const findEmailsByCriteriaFlow = ai.defineFlow(
  {
    name: 'findEmailsByCriteriaFlow',
    inputSchema: FindEmailsByCriteriaInputSchema,
    outputSchema: FindEmailsByCriteriaOutputSchema,
    tools: [findApolloEmailsTool, validateEmailTool],
  },
  async (input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> => {
    let reasoningSteps = [];
    let identifiedCompanyCount = 0;
    let totalAISuggestedEmails = 0;
    let totalApolloEmailsFound = 0;
    let apolloToolErrorCount = 0;
    let apolloApiKeyIssueDetected = false;
    let basicFormatCheckToolError = false;

    try {
      // Step 1: Use LLM to identify relevant companies and suggest initial emails
      const llmResponse = await identifyCompaniesAndSuggestEmailsPrompt(input);

      if (!llmResponse.output || !llmResponse.output.companies || llmResponse.output.companies.length === 0) {
        reasoningSteps.push('LLM could not identify relevant companies or suggest initial emails for the search criteria.');
        return {
          emailAddresses: [],
          reasoning: reasoningSteps.join(' '),
        };
      }

      const companiesFromLLM = llmResponse.output.companies;
      identifiedCompanyCount = companiesFromLLM.length;
      reasoningSteps.push(llmResponse.output.initialReasoning || `LLM identified ${identifiedCompanyCount} companies.`);

      const allPotentialEmailsFromAI: string[] = [];
      companiesFromLLM.forEach(company => {
        if (company.suggestedEmails && company.suggestedEmails.length > 0) {
          allPotentialEmailsFromAI.push(...company.suggestedEmails.filter(e => typeof e === 'string'));
        }
      });
      totalAISuggestedEmails = allPotentialEmailsFromAI.length;
      reasoningSteps.push(`LLM directly suggested ${totalAISuggestedEmails} email(s).`);

      // Step 2: Use Apollo.io tool to find additional emails for these companies
      const allPotentialEmailsFromApollo: string[] = [];

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
        if (result.emails && result.emails.length > 0) {
          allPotentialEmailsFromApollo.push(...result.emails.filter(e => typeof e === 'string'));
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

      // Combine emails from AI and Apollo
      const combinedPotentialEmails = [...allPotentialEmailsFromAI, ...allPotentialEmailsFromApollo]
                                      .filter(email => typeof email === 'string' && email.trim() !== '');

      if (combinedPotentialEmails.length === 0) {
        reasoningSteps.push("No potential emails found from AI suggestions or Apollo.io to perform basic format check on.");
        return {
          emailAddresses: [],
          reasoning: reasoningSteps.join(' '),
        };
      }

      const uniquePotentialEmails = Array.from(new Set(combinedPotentialEmails.map(e => e.toLowerCase()))); // Standardize to lowercase
      reasoningSteps.push(`Combined to ${uniquePotentialEmails.length} unique potential emails for basic format check.`);

      // Step 3: Perform basic format check on all unique emails using the validateEmailTool
      const allFormatCheckedEmails: string[] = [];
      const validatedEmailResults: ValidateEmailOutput[] = [];
      const CHUNK_SIZE = 10;

      for (let i = 0; i < uniquePotentialEmails.length; i += CHUNK_SIZE) {
        const chunk = uniquePotentialEmails.slice(i, i + CHUNK_SIZE);
        const validationPromises = chunk.map(email =>
          validateEmailTool({ email }) // Basic format check
            .catch(e => {
              console.error(`Critical error during basic validateEmailTool call for ${email}:`, e);
              basicFormatCheckToolError = true;
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
          console.error('Error processing a chunk of email basic format checks:', e);
          basicFormatCheckToolError = true;
        }
      }

      for (const result of validatedEmailResults) {
        if (result.status === 'valid' && result.email) {
          allFormatCheckedEmails.push(result.email);
        } else if (result.status !== 'valid' && result.email) {
          console.warn(`Basic email format check for ${result.email} resulted in status '${result.status}': ${result.sub_status}`);
          if(result.status === 'error_tool_invocation_failed') basicFormatCheckToolError = true;
        }
      }

      reasoningSteps.push(`Basic format check confirmed ${allFormatCheckedEmails.length} email(s) as having a valid-looking format.`);
      if (basicFormatCheckToolError) {
          reasoningSteps.push(`Some emails encountered errors during the basic format check tool invocation. Please check server logs for details.`);
      }
      reasoningSteps.push(`Displaying all ${allFormatCheckedEmails.length} email(s) with a valid-looking format.`);


      return {
        emailAddresses: allFormatCheckedEmails,
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
