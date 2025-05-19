
'use server';
/**
 * @fileOverview Service for interacting with the ZeroBounce API.
 */

import { z } from 'genkit';

const ZeroBounceResponseSchema = z.object({
  address: z.string(),
  status: z.string(),
  sub_status: z.string(),
  free_email: z.boolean(),
  did_you_mean: z.string().nullable(),
  account: z.string().nullable(),
  domain: z.string().nullable(),
  domain_age_days: z.string().nullable(),
  smtp_provider: z.string().nullable(),
  mx_found: z.string().nullable(), // ZeroBounce returns "true" or "false" as strings
  mx_record: z.string().nullable(),
  firstname: z.string().nullable(),
  lastname: z.string().nullable(),
  gender: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  zipcode: z.string().nullable(),
  processed_at: z.string(),
});
export type ZeroBounceResponse = z.infer<typeof ZeroBounceResponseSchema>;

export async function verifyEmailWithZeroBounce(email: string, apiKey: string): Promise<ZeroBounceResponse> {
  if (!apiKey) {
    throw new Error('ZeroBounce API key is not configured.');
  }

  const url = `https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response from ZeroBounce' }));
      console.error('ZeroBounce API Error:', errorData);
      throw new Error(`ZeroBounce API request failed with status ${response.status}: ${errorData.message || response.statusText}`);
    }
    const data = await response.json();
    return ZeroBounceResponseSchema.parse(data);
  } catch (error) {
    console.error('Error calling ZeroBounce API:', error);
    // Return a synthetic error response that fits the schema but indicates failure
    return {
      address: email,
      status: "unknown", // Or a more specific error status if appropriate
      sub_status: "api_error",
      free_email: false,
      did_you_mean: null,
      account: null,
      domain: null,
      domain_age_days: null,
      smtp_provider: null,
      mx_found: "false",
      mx_record: null,
      firstname: null,
      lastname: null,
      gender: null,
      country: null,
      region: null,
      city: null,
      zipcode: null,
      processed_at: new Date().toISOString(),
    };
  }
}
