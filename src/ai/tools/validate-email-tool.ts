
/**
 * @fileOverview Genkit tool for basic email validation.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const ValidateEmailInputSchema = z.object({
  email: z.string().describe('The email address to validate.'),
});
export type ValidateEmailInput = z.infer<typeof ValidateEmailInputSchema>;

export const ValidateEmailOutputSchema = z.object({
  email: z.string().describe('The validated email address.'),
  status: z.string().describe("Validation status (e.g., 'valid', 'invalid')."),
  sub_status: z.string().optional().describe('Detailed sub-status or flags.'),
  domain: z.string().optional().describe('The domain of the email address.'),
});
export type ValidateEmailOutput = z.infer<typeof ValidateEmailOutputSchema>;

export const validateEmailTool = ai.defineTool(
  {
    name: 'validateEmailBasic',
    description: 'Performs basic validation on an email address string.',
    inputSchema: ValidateEmailInputSchema,
    outputSchema: ValidateEmailOutputSchema,
  },
  async (input: ValidateEmailInput): Promise<ValidateEmailOutput> => {
    const email = input.email.trim();
    let domain;
    try {
      domain = email.substring(email.lastIndexOf("@") + 1);
    } catch (e) {
      domain = undefined;
    }

    // Basic check: not empty and contains "@"
    if (email && email.includes('@') && email.length > 3) {
      return {
        email: email,
        status: 'valid', // All non-empty emails containing "@" are considered "valid" by this basic check
        sub_status: 'basic_format_ok',
        domain: domain,
      };
    } else {
      return {
        email: email,
        status: 'invalid',
        sub_status: 'basic_format_failed',
        domain: domain,
      };
    }
  }
);
