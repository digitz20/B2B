
/**
 * @fileOverview Genkit tool for email validation using NeverBounce.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { verifyEmailWithNeverBounce, type NeverBounceResponse } from '@/services/neverbounce';

export const ValidateEmailInputSchema = z.object({
  email: z.string().describe('The email address to validate.'),
});
export type ValidateEmailInput = z.infer<typeof ValidateEmailInputSchema>;

export const ValidateEmailOutputSchema = z.object({
  email: z.string().describe('The validated email address.'),
  status: z.string().describe("Validation status (e.g., 'valid', 'invalid', 'catchall', 'unknown', or various error statuses)."),
  sub_status: z.string().optional().describe('Detailed sub-status or flags from the validation service.'),
  domain: z.string().optional().describe('The domain of the email address.'),
});
export type ValidateEmailOutput = z.infer<typeof ValidateEmailOutputSchema>;

export const validateEmailTool = ai.defineTool(
  {
    name: 'validateEmailWithNeverBounce',
    description: 'Performs email validation using the NeverBounce API to check for deliverability.',
    inputSchema: ValidateEmailInputSchema,
    outputSchema: ValidateEmailOutputSchema,
  },
  async (input: ValidateEmailInput): Promise<ValidateEmailOutput> => {
    const apiKey = process.env.NEVERBOUNCE_API_KEY;
    if (!apiKey) {
      console.error('NEVERBOUNCE_API_KEY environment variable is not set.');
      return {
        email: input.email,
        status: 'error_api_key_missing',
        sub_status: 'NeverBounce API key is not configured on the server.',
      };
    }

    try {
      const result: NeverBounceResponse = await verifyEmailWithNeverBounce(input.email, apiKey);
      
      // The primary outcome is in `result.result` for successful calls
      // and `result.status` for API-level issues (like 'auth_failure').
      const status = result.status === 'success' ? result.result || 'unknown' : result.status;

      return {
        email: input.email,
        status: status,
        sub_status: result.message || (result.flags ? result.flags.join(', ') : undefined),
        domain: result.address_info?.domain,
      };

    } catch (error) {
      console.error(`Error validating email ${input.email} with NeverBounce tool:`, error);
      return {
        email: input.email,
        status: 'error_validation_failed',
        sub_status: error instanceof Error ? error.message : 'Unknown error invoking NeverBounce tool.',
      };
    }
  }
);
