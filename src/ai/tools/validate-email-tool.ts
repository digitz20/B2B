
/**
 * @fileOverview Genkit tool for validating email addresses using NeverBounce.
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
  status: z.string().describe("Validation status (e.g., 'valid', 'invalid', 'catchall', 'unknown', 'error_api_key_missing', 'error_validation_failed')."),
  sub_status: z.string().optional().describe('Detailed sub-status or flags from NeverBounce (e.g., NeverBounce result or joined flags).'),
  domain: z.string().optional().describe('The domain of the email address.'),
});
export type ValidateEmailOutput = z.infer<typeof ValidateEmailOutputSchema>;

export const validateEmailTool = ai.defineTool(
  {
    name: 'validateEmailWithNeverBounce', // Updated name for clarity, though flows might still refer to the old one if not changed there
    description: 'Validates an email address using the NeverBounce API and returns its status.',
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
        sub_status: 'configuration_error_client_side', // Differentiate from API's own auth_failure
      };
    }

    try {
      const validationResult: NeverBounceResponse = await verifyEmailWithNeverBounce(input.email, apiKey);

      // Handle NeverBounce API-level errors (e.g., auth_failure, rate_limit)
      if (validationResult.status !== 'success') {
        let toolStatus = 'error_validation_failed';
        if (validationResult.status === 'auth_failure') {
          toolStatus = 'error_api_key_missing'; // Map NeverBounce auth_failure to our specific error status
        } else if (validationResult.status === 'throttle_error' || validationResult.status === 'rate_limit') {
          toolStatus = 'error_rate_limited';
        }
        console.warn(`NeverBounce API error for ${input.email}: Status: ${validationResult.status}, Message: ${validationResult.message}`);
        return {
          email: input.email,
          status: toolStatus,
          sub_status: validationResult.message || validationResult.status, // Use NeverBounce message as sub_status
          domain: validationResult.address_info?.domain || undefined,
        };
      }
      
      // Handle actual email validation results if API call was 'success'
      const resultStatus = validationResult.result || 'unknown'; // Default to 'unknown' if result is missing
      let finalSubStatus = resultStatus;
      if (validationResult.flags && validationResult.flags.length > 0) {
        finalSubStatus = `${resultStatus} (${validationResult.flags.join(', ')})`;
      }

      return {
        email: validationResult.address_info?.original_email || input.email, // Prefer original_email if available
        status: resultStatus, // This is 'valid', 'invalid', 'catchall', 'disposable', 'unknown'
        sub_status: finalSubStatus,
        domain: validationResult.address_info?.domain || undefined,
      };

    } catch (error) { // Catch errors from verifyEmailWithNeverBounce if it throws unexpectedly
      console.error(`Critical error validating email ${input.email} with NeverBounce tool:`, error);
      return {
        email: input.email,
        status: 'error_tool_invocation_failed', // Generic tool error
        sub_status: error instanceof Error ? error.message : 'unknown_tool_error',
      };
    }
  }
);
