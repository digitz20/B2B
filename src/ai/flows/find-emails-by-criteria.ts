
'use server';
/**
 * @fileOverview Finds email addresses related to a given search criteria.
 * It uses an LLM to identify relevant company domains and suggest initial emails.
 * Then, it uses Apollo.io (via a tool) to find additional emails for those domains.
 * Finally, it validates all found emails (from AI and Apollo) using NeverBounce (via a tool).
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
    .array(z.string().email())
    .describe('The VERIFIED email addresses. Each string should be a valid email format. Max 30 emails.'),
  reasoning: z.string().optional().describe("Explanation of companies identified, emails suggested by AI, emails found via Apollo.io, and validation results from NeverBounce. Includes if results were capped at 30 validated emails."),
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
      suggestedEmails: z.array(z.string()).describe("Email addresses (or strings that look like emails) directly suggested by the AI for this company based on public information or common patterns. These will be validated separately by NeverBounce.").default([]),
    })).describe("A list of 5-10 diverse companies/organizations relevant to the search criteria. Prioritize companies for which email addresses are likely to be findable. For each, also suggest potential email addresses if possible."),
    initialReasoning: z.string().optional().describe("Brief reasoning for selecting these companies and suggesting initial emails based on the search criteria."),
  })},
  prompt: `You are an expert research assistant. Your task is to identify companies relevant to the given search criteria and suggest potential email addresses for them.
These companies will also be used to search for more emails using a tool like Apollo.io. The emails you suggest and those found by Apollo.io will be validated by NeverBounce.

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

const MAX_VALIDATED_EMAILS_TO_RETURN = 30;
const MAX_EMAILS_PER_DOMAIN_FROM_APOLLO = 5; // How many emails to try and fetch per domain from Apollo

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
    let apolloToolErrors = 0;
    let validationToolError = false;

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
            console.error(`Error calling findApolloEmailsTool for ${company.domain}:`, e);
            apolloToolErrors++;
            return { domain: company.domain, emails: [], error: e instanceof Error ? e.message : "Unknown tool error" } as FindApolloEmailsOutput;
          })
      );
      
      const apolloResults = await Promise.all(apolloPromises);

      apolloResults.forEach(result => {
        if (result.emails && result.emails.length > 0) { // Added null check for result.emails
          allPotentialEmailsFromApollo.push(...result.emails);
          totalApolloEmailsFound += result.emails.length;
        }
        if (result.error) {
            console.warn(`Apollo.io tool error for domain ${result.domain}: ${result.error}`);
        }
      });
      
      reasoningSteps.push(`Apollo.io found an additional ${totalApolloEmailsFound} potential email(s) for these ${identifiedCompanyCount} domains.`);
      if (apolloToolErrors > 0) {
        reasoningSteps.push(`${apolloToolErrors} domain(s) encountered errors during Apollo.io search.`);
      }

      // Combine emails from AI and Apollo
      const combinedPotentialEmails = [...allPotentialEmailsFromAI, ...allPotentialEmailsFromApollo];
      
      if (combinedPotentialEmails.length === 0) {
        reasoningSteps.push("No potential emails found from AI suggestions or Apollo.io to validate.");
        return {
          emailAddresses: [],
          reasoning: reasoningSteps.join(' '),
        };
      }
      
      // Remove duplicates before validation
      const uniquePotentialEmails = Array.from(new Set(combinedPotentialEmails.filter(email => typeof email === 'string' && email.trim() !== ''))); // Filter out non-strings or empty strings
      reasoningSteps.push(`Combined to ${uniquePotentialEmails.length} unique potential emails for validation.`);

      // Step 3: Validate all unique emails using NeverBounce (via validateEmailTool)
      const allVerifiedEmails: string[] = [];
      const validatedEmailResults: ValidateEmailOutput[] = [];
      const CHUNK_SIZE = 10; 

      for (let i = 0; i < uniquePotentialEmails.length; i += CHUNK_SIZE) {
        const chunk = uniquePotentialEmails.slice(i, i + CHUNK_SIZE);
        const validationPromises = chunk.map(email =>
          validateEmailTool({ email })
            .catch(e => {
              console.error(`Critical error during validateEmailTool call for ${email}:`, e);
              validationToolError = true;
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
          validationToolError = true; 
        }
      }
      
      for (const result of validatedEmailResults) {
        if (result.status === 'valid' && result.email) { // ensure result.email is present
          allVerifiedEmails.push(result.email);
        } else if (
          result.status === 'error_api_key_missing' ||
          result.status === 'error_validation_failed' ||
          result.status === 'error_tool_invocation_failed' ||
          result.status === 'error_rate_limited'
        ) {
          console.warn(`Email validation for ${result.email} resulted in status '${result.status}': ${result.sub_status}`);
          validationToolError = true;
        }
      }
      
      reasoningSteps.push(`NeverBounce validation confirmed ${allVerifiedEmails.length} email(s) as valid.`);

      const emailsToReturn = allVerifiedEmails.slice(0, MAX_VALIDATED_EMAILS_TO_RETURN);

      if (allVerifiedEmails.length > MAX_VALIDATED_EMAILS_TO_RETURN) {
        reasoningSteps.push(`Displaying the first ${MAX_VALIDATED_EMAILS_TO_RETURN} of these validated emails.`);
      } else {
        reasoningSteps.push(`Displaying all ${emailsToReturn.length} validated email(s).`);
      }

      if (validationToolError) {
          reasoningSteps.push(`Some email validations may have been skipped or failed due to NeverBounce API issues (e.g., misconfigured API key, service error, or tool invocation problem). Check server logs.`);
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
