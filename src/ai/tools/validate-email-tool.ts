
/**
 * @fileOverview Genkit tool for validating email addresses using ZeroBounce.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { verifyEmailWithZeroBounce, type ZeroBounceResponse } from '@/services/zerobounce';

export const ValidateEmailInputSchema = z.object({
  email: z.string().describe('The email address to validate.'),
});
export type ValidateEmailInput = z.infer<typeof ValidateEmailInputSchema>;

// We only need a subset of the ZeroBounce response for the tool's output
export const ValidateEmailOutputSchema = z.object({
  email: z.string().describe('The validated email address.'),
  status: z.string().describe('Validation status from ZeroBounce (e.g., valid, invalid, catch-all).'),
  sub_status: z.string().optional().describe('Detailed sub-status from ZeroBounce.'),
  domain: z.string().optional().describe('The domain of the email address.'),
});
export type ValidateEmailOutput = z.infer<typeof ValidateEmailOutputSchema>;

export const validateEmailTool = ai.defineTool(
  {
    name: 'validateEmailWithZeroBounce',
    description: 'Validates an email address using the ZeroBounce API and returns its status.',
    inputSchema: ValidateEmailInputSchema,
    outputSchema: ValidateEmailOutputSchema,
  },
  async (input: ValidateEmailInput): Promise<ValidateEmailOutput> => {
    const apiKey = process.env.ZEROBOUNCE_API_KEY;
    if (!apiKey) {
      console.error('ZEROBOUNCE_API_KEY environment variable is not set.');
      // Return a specific status if API key is missing, so flow can decide how to handle
      return {
        email: input.email,
        status: 'error_api_key_missing',
        sub_status: 'configuration_error',
      };
    }

    try {
      const validationResult: ZeroBounceResponse = await verifyEmailWithZeroBounce(input.email, apiKey);
      return {
        email: validationResult.address,
        status: validationResult.status,
        sub_status: validationResult.sub_status,
        domain: validationResult.domain || undefined,
      };
    } catch (error) {
      console.error(`Error validating email ${input.email} with ZeroBounce:`, error);
      // Return an error status
      return {
        email: input.email,
        status: 'error_validation_failed',
        sub_status: error instanceof Error ? error.message : 'unknown_api_error',
      };
    }
  }
);
