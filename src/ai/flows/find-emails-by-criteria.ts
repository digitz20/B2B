
'use server';
/**
 * @fileOverview Finds email addresses related to a given search criteria.
 * It uses an LLM to identify relevant company domains and suggest initial emails.
 * Then, it uses Apollo.io (via a tool) to find additional emails for those domains.
 * Finally, it performs a basic format check on all found emails.
 * Returns a maximum of 30 validated emails.
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
    .describe('The email addresses found. Each string should resemble an email format. Max 30 emails.'),
  reasoning: z.string().optional().describe("Explanation of companies identified, emails suggested by AI, emails found via Apollo.io, and basic validation results. Includes if results were capped at 30 emails."),
});
export type FindEmailsByCriteriaOutput = z.infer<typeof FindEmailsByCriteriaOutputSchema>;

export async function findEmailsByCriteria(input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> {
  return findEmailsByCriteriaFlow(input);
}

const identifyCompaniesAndSuggestEmailsPrompt = ai.definePrompt({
  name: 'identifyCompaniesAndSuggestEmailsPrompt',
  input: {schema: FindEmailsByCriteriaInputSchema},
  output: {schema: z.object({
    companies: z.array(z.object({
      name: z.string().describe("The name of the identified company."),
      domain: z.string().describe("The primary website domain of the company (e.g., example.com)."),
      suggestedEmails: z.array(z.string()).describe("Email addresses (or strings that look like emails) directly suggested by the AI for this company based on public information or common patterns. These will undergo a basic format check.").default([]),
    })).describe("A list of 5-10 diverse companies/organizations relevant to the search criteria. Prioritize companies for which email addresses are likely to be findable. For each, also suggest potential email addresses if possible."),
    initialReasoning: z.string().optional().describe("Brief reasoning for selecting these companies and suggesting initial emails based on the search criteria."),
  })},
  prompt: `You are an expert research assistant. Your task is to identify companies relevant to the given search criteria and suggest potential email addresses for them.
These companies will also be used to search for more emails using a tool like Apollo.io. The emails you suggest and those found by Apollo.io will undergo a basic format check.

Search Criteria: {{{searchCriteria}}}

Based on the search criteria, please:
1.  Identify a list of 5 to 10 diverse companies or organizations that are highly relevant.
    Focus on companies where business contact information (emails) is likely to be publicly discoverable.
    For each company, provide its name and its primary website domain (e.g., 'Google', 'google.com').
2.  For each identified company, if possible, directly suggest a few potential email addresses (or strings that look like email addresses). These could be generic (e.g., contact@, info@) or based on common patterns if individual names are discoverable (e.g., firstname.lastname@domain.com).
3.  Provide a brief 'initialReasoning' explaining why these companies were chosen and how you approached suggesting emails.

List the companies in the 'companies' array, each with 'name', 'domain', and 'suggestedEmails'. If no emails can be suggested for a company, return an empty array for 'suggestedEmails'.
Your goal is to provide a broad starting point for contact discovery. Aim for a substantial number of contacts overall when combined with other tools, potentially well over 1000 if the criteria are broad. Think expansively, consider related and adjacent industries to maximize results if the initial criteria is too narrow. Clearly state in your reasoning if and how you broadened the search.
Include various types of publicly listed email addresses, such as generic company contacts, and emails of individuals associated with these companies if publicly available (e.g., on company websites, public professional directories, professional social media pages where emails are openly shared, relevant online forums, personal websites, or professional portfolios). Personal-style email addresses (e.g., from providers like Gmail, Outlook.com, Yahoo, etc.) should be included if they are publicly listed by individuals in direct relation to their professional activities, services, or public profile relevant to the search criteria.
If you achieve a target of over 1000 potential contacts, please indicate this in your reasoning and describe the breadth of your search.
`,
});

const MAX_EMAILS_TO_RETURN = 30;
const MAX_EMAILS_PER_DOMAIN_FROM_APOLLO = 5;

const findEmailsByCriteriaFlow = ai.defineFlow(
  {
    name: 'findEmailsByCriteriaFlow',
    inputSchema: FindEmailsByCriteriaInputSchema,
    outputSchema: FindEmailsByCriteriaOutputSchema,
    tools: [findApolloEmailsTool, validateEmailTool], // validateEmailTool is now a basic checker
  },
  async (input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> => {
    let reasoningSteps = [];
    let identifiedCompanyCount = 0;
    let totalAISuggestedEmails = 0;
    let totalApolloEmailsFound = 0;
    let apolloToolErrorCount = 0;
    let apolloApiKeyIssueDetected = false;
    let basicValidationToolError = false; // Flag for basic validation tool issues

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
          allPotentialEmailsFromAI.push(...company.suggestedEmails);
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
            return { domain: company.domain, emails: [], error: `Tool invocation failed: ${e instanceof Error ? e.message : "Unknown tool error"}` } as FindApolloEmailsOutput;
          })
      );
      
      const apolloResults = await Promise.all(apolloPromises);

      apolloResults.forEach(result => {
        if (result.emails && result.emails.length > 0) {
          allPotentialEmailsFromApollo.push(...result.emails);
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
      
      reasoningSteps.push(`Apollo.io found an additional ${totalApolloEmailsFound} potential email(s) for these ${identifiedCompanyCount} domains.`);
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
      const combinedPotentialEmails = [...allPotentialEmailsFromAI, ...allPotentialEmailsFromApollo].filter(email => typeof email === 'string' && email.trim() !== '');
      
      if (combinedPotentialEmails.length === 0) {
        reasoningSteps.push("No potential emails found from AI suggestions or Apollo.io to validate.");
        return {
          emailAddresses: [],
          reasoning: reasoningSteps.join(' '),
        };
      }
      
      const uniquePotentialEmails = Array.from(new Set(combinedPotentialEmails));
      reasoningSteps.push(`Combined to ${uniquePotentialEmails.length} unique potential emails for basic format validation.`);

      // Step 3: Validate all unique emails using the basic validateEmailTool
      const allFormatCheckedEmails: string[] = [];
      const validatedEmailResults: ValidateEmailOutput[] = [];
      const CHUNK_SIZE = 10; 

      for (let i = 0; i < uniquePotentialEmails.length; i += CHUNK_SIZE) {
        const chunk = uniquePotentialEmails.slice(i, i + CHUNK_SIZE);
        const validationPromises = chunk.map(email =>
          validateEmailTool({ email })
            .catch(e => {
              console.error(`Critical error during basic validateEmailTool call for ${email}:`, e);
              basicValidationToolError = true; 
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
          basicValidationToolError = true; 
        }
      }
      
      for (const result of validatedEmailResults) {
        if (result.status === 'valid' && result.email) {
          allFormatCheckedEmails.push(result.email);
        } else if (result.status !== 'valid') { // e.g. 'invalid', 'error_tool_invocation_failed'
          console.warn(`Basic email validation for ${result.email} resulted in status '${result.status}': ${result.sub_status}`);
          if(result.status === 'error_tool_invocation_failed') basicValidationToolError = true;
        }
      }
      
      reasoningSteps.push(`Basic format check confirmed ${allFormatCheckedEmails.length} email(s) as having a valid-looking format.`);

      const emailsToReturn = allFormatCheckedEmails.slice(0, MAX_EMAILS_TO_RETURN);

      if (allFormatCheckedEmails.length > MAX_EMAILS_TO_RETURN) {
        reasoningSteps.push(`Displaying the first ${MAX_EMAILS_TO_RETURN} of these emails.`);
      } else {
        reasoningSteps.push(`Displaying all ${emailsToReturn.length} email(s) with a valid-looking format.`);
      }

      if (basicValidationToolError) {
          reasoningSteps.push(`Some emails encountered errors during the basic format validation tool invocation. Please check server logs for details.`);
      }

      return {
        emailAddresses: emailsToReturn,
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
