
'use server';
/**
 * @fileOverview Service for interacting with the NeverBounce API.
 */

import { z } from 'genkit';

// Defines the structure of the expected response from NeverBounce API
const NeverBounceAddressInfoSchema = z.object({
  original_email: z.string().nullable().optional(),
  normalized_email: z.string().nullable().optional(),
  addr: z.string().nullable().optional(),
  alias: z.string().nullable().optional(),
  host: z.string().nullable().optional(),
  fqdn: z.string().nullable().optional(),
  domain: z.string().nullable().optional(),
  subdomain: z.string().nullable().optional(),
  tld: z.string().nullable().optional(),
}).optional();

const NeverBounceResponseSchema = z.object({
  status: z.string().describe("Overall status of the API request (e.g., 'success', 'auth_failure', 'rate_limit')."),
  result: z.string().optional().describe("Validation result for the email (e.g., 'valid', 'invalid', 'disposable', 'catchall', 'unknown'). This is present on status: 'success'."),
  flags: z.array(z.string()).optional().describe("Additional flags providing more context about the email."),
  suggested_correction: z.string().nullable().optional().describe("Suggested correction for a potentially misspelled email."),
  address_info: NeverBounceAddressInfoSchema,
  execution_time: z.number().optional(),
  // Fields for errors
  message: z.string().optional().describe("Error message, present if status is not 'success'."),
});
export type NeverBounceResponse = z.infer<typeof NeverBounceResponseSchema>;

export async function verifyEmailWithNeverBounce(email: string, apiKey: string): Promise<NeverBounceResponse> {
  if (!apiKey) {
    // This case should ideally be caught before calling, but as a safeguard:
    return {
      status: 'client_error',
      message: 'NeverBounce API key is not configured.',
      address_info: { original_email: email },
    };
  }

  const url = `https://api.neverbounce.com/v4/single/check?key=${apiKey}&email=${encodeURIComponent(email)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Attempt to parse, but handle potential parsing errors or unexpected structures.
    const parsedData = NeverBounceResponseSchema.safeParse(data);
    if (!parsedData.success) {
      console.error('NeverBounce API response parsing error:', parsedData.error, 'Original data:', data);
      return {
        status: 'api_error',
        message: `Failed to parse NeverBounce response. ${parsedData.error.toString()}`,
        result: 'unknown',
        address_info: { original_email: email },
      };
    }

    // If NeverBounce itself indicates an API-level error (like auth_failure)
    if (parsedData.data.status !== 'success' && parsedData.data.message) {
        console.warn(`NeverBounce API returned status '${parsedData.data.status}' for ${email}: ${parsedData.data.message}`);
        // We return the whole response as it might contain useful info like 'auth_failure'
        return parsedData.data;
    }
    
    // If it's a success status from NeverBounce but the result field is missing (should not happen with 'success')
    if (parsedData.data.status === 'success' && !parsedData.data.result) {
        console.warn(`NeverBounce API returned status 'success' for ${email} but no 'result' field.`);
        return {
            ...parsedData.data,
            result: 'unknown', // Default to unknown if result is missing on success
        };
    }

    return parsedData.data;

  } catch (error) {
    console.error(`Error calling NeverBounce API for ${email}:`, error);
    let errorMessage = 'Unknown API error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return {
      status: 'network_error', // Or a more generic 'api_error'
      message: `Network or unexpected error during NeverBounce API call: ${errorMessage}`,
      result: 'unknown',
      address_info: { original_email: email },
    };
  }
}
