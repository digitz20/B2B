
'use server';
/**
 * @fileOverview Finds email addresses related to a given search criteria.
 * It first uses an LLM to identify relevant company domains.
 * Then, it uses Apollo.io (via a tool) to find emails for those domains.
 * Finally, it validates the found emails using NeverBounce (via a tool).
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
    .describe('The profession, industry, or aspect of work to search for.'),
});
export type FindEmailsByCriteriaInput = z.infer<typeof FindEmailsByCriteriaInputSchema>;

const FindEmailsByCriteriaOutputSchema = z.object({
  emailAddresses: z
    .array(z.string().email())
    .describe('The VERIFIED email addresses. Each string should be a valid email format. Max 30 emails.'),
  reasoning: z.string().optional().describe("Explanation of the companies identified, emails found via Apollo.io, and validation results from NeverBounce. Includes if results were capped at 30 validated emails."),
});
export type FindEmailsByCriteriaOutput = z.infer<typeof FindEmailsByCriteriaOutputSchema>;

export async function findEmailsByCriteria(input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> {
  return findEmailsByCriteriaFlow(input);
}

const identifyCompaniesPrompt = ai.definePrompt({
  name: 'identifyCompaniesPrompt',
  input: {schema: FindEmailsByCriteriaInputSchema},
  output: {schema: z.object({
    companies: z.array(z.object({
      name: z.string().describe("The name of the identified company."),
      domain: z.string().describe("The primary website domain of the company (e.g., example.com).")
    })).describe("A list of 5-10 diverse companies/organizations relevant to the search criteria. Prioritize companies for which email addresses are likely to be findable via business databases."),
    initialReasoning: z.string().optional().describe("Brief reasoning for selecting these companies based on the search criteria."),
  })},
  prompt: `You are an expert research assistant. Your task is to identify a list of companies relevant to the given search criteria.
These companies will then be used to search for email addresses using a tool like Apollo.io.

Search Criteria: {{{searchCriteria}}}

Based on the search criteria, please:
1.  Identify a list of 5 to 10 diverse companies or organizations that are highly relevant.
    Focus on companies where business contact information (emails) is likely to be publicly discoverable or available in business databases.
    For each company, provide its name and its primary website domain (e.g., 'Google', 'google.com').
2.  Provide a brief 'initialReasoning' explaining why these companies were chosen in relation to the 'searchCriteria'.

List the companies in the 'companies' array, each with a 'name' and 'domain'.
`,
});

const MAX_VALIDATED_EMAILS_TO_RETURN = 30;
const MAX_EMAILS_PER_DOMAIN_FROM_APOLLO = 5; // How many emails to fetch per domain from Apollo

const findEmailsByCriteriaFlow = ai.defineFlow(
  {
    name: 'findEmailsByCriteriaFlow',
    inputSchema: FindEmailsByCriteriaInputSchema,
    outputSchema: FindEmailsByCriteriaOutputSchema,
    tools: [findApolloEmailsTool, validateEmailTool], // Both tools are available
  },
  async (input: FindEmailsByCriteriaInput): Promise<FindEmailsByCriteriaOutput> => {
    let llmReasoning = "Process started. ";
    let apolloSummary = "";
    let validationSummary = "";
    let identifiedCompanyCount = 0;
    let totalApolloEmailsFound = 0;

    try {
      // Step 1: Use LLM to identify relevant companies
      const llmResponse = await identifyCompaniesPrompt(input);
      
      if (!llmResponse.output || !llmResponse.output.companies || llmResponse.output.companies.length === 0) {
        llmReasoning += 'LLM could not identify relevant companies for the search criteria. ';
        return {
          emailAddresses: [],
          reasoning: llmReasoning + "No companies identified to search with Apollo.io.",
        };
      }
      
      const companiesToSearch = llmResponse.output.companies;
      identifiedCompanyCount = companiesToSearch.length;
      llmReasoning += llmResponse.output.initialReasoning || `LLM identified ${identifiedCompanyCount} companies. `;

      // Step 2: Use Apollo.io tool to find emails for these companies
      const allPotentialEmails: string[] = [];
      let apolloToolErrors = 0;

      const apolloPromises = companiesToSearch.map(company => 
        findApolloEmailsTool({ domain: company.domain, maxEmailsPerDomain: MAX_EMAILS_PER_DOMAIN_FROM_APOLLO })
          .catch(e => {
            console.error(`Error calling findApolloEmailsTool for ${company.domain}:`, e);
            apolloToolErrors++;
            return { domain: company.domain, emails: [], error: e instanceof Error ? e.message : "Unknown tool error" } as FindApolloEmailsOutput;
          })
      );
      
      const apolloResults = await Promise.all(apolloPromises);

      apolloResults.forEach(result => {
        if (result.emails.length > 0) {
          allPotentialEmails.push(...result.emails);
          totalApolloEmailsFound += result.emails.length;
        }
        if (result.error) {
            console.warn(`Apollo.io tool error for domain ${result.domain}: ${result.error}`);
            // Optionally add to reasoning: llmReasoning += `Apollo.io error for ${result.domain}. `;
        }
      });
      
      apolloSummary = `Attempted to find emails for ${identifiedCompanyCount} domains using Apollo.io. Found ${totalApolloEmailsFound} potential email(s). `;
      if (apolloToolErrors > 0) {
        apolloSummary += `${apolloToolErrors} domain(s) encountered errors during Apollo.io search. `;
      }

      if (allPotentialEmails.length === 0) {
        return {
          emailAddresses: [],
          reasoning: llmReasoning + apolloSummary + "No potential emails found via Apollo.io to validate.",
        };
      }
      
      // Remove duplicates before validation
      const uniquePotentialEmails = Array.from(new Set(allPotentialEmails));

      // Step 3: Validate emails using NeverBounce (via validateEmailTool)
      const allVerifiedEmails: string[] = [];
      let validationToolError = false;
      const validatedEmailResults: ValidateEmailOutput[] = [];
      const CHUNK_SIZE = 10; // Process 10 email validations concurrently

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
        if (result.status === 'valid') {
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
      
      validationSummary = `From ${uniquePotentialEmails.length} unique emails, ${allVerifiedEmails.length} email(s) were confirmed as valid by NeverBounce. `;

      const emailsToReturn = allVerifiedEmails.slice(0, MAX_VALIDATED_EMAILS_TO_RETURN);

      if (allVerifiedEmails.length > MAX_VALIDATED_EMAILS_TO_RETURN) {
        validationSummary += `Displaying the first ${MAX_VALIDATED_EMAILS_TO_RETURN} of these validated emails. `;
      } else {
        validationSummary += `Displaying all ${emailsToReturn.length} validated email(s). `;
      }

      if (validationToolError) {
          validationSummary += `Some email validations may have been skipped or failed due to NeverBounce API issues (e.g., misconfigured API key, service error, or tool invocation problem). Check server logs. `;
      }

      return {
        emailAddresses: emailsToReturn,
        reasoning: llmReasoning + apolloSummary + validationSummary,
      };

    } catch (error) {
      console.error('CRITICAL_ERROR in findEmailsByCriteriaFlow:', error instanceof Error ? error.stack : String(error));
      return {
        emailAddresses: [],
        reasoning: llmReasoning + apolloSummary + validationSummary + 'A critical server error occurred during the find contacts process. Please check server logs or try again later.',
      };
    }
  }
);
