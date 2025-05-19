
'use server';
/**
 * @fileOverview Service for interacting with the Apollo.io API to find emails.
 */

import { z } from 'genkit';

// Define a plausible structure for Apollo.io person data (simplified)
const ApolloPersonSchema = z.object({
  email: z.string().email().nullable(),
  // Add other fields you might want to use from Apollo, e.g., name, title
});

// Define a plausible structure for the Apollo.io API response (simplified)
const ApolloSearchResponseSchema = z.object({
  people: z.array(ApolloPersonSchema).default([]),
  // Apollo might have pagination or other metadata here
});
export type ApolloSearchResponse = z.infer<typeof ApolloSearchResponseSchema>;

interface FetchApolloEmailsParams {
  domain: string;
  apiKey: string;
  maxEmailsPerDomain?: number;
}

export async function fetchEmailsFromApollo({ domain, apiKey, maxEmailsPerDomain = 5 }: FetchApolloEmailsParams): Promise<string[]> {
  if (!apiKey) {
    console.error('Apollo.io API key is not configured.');
    return [];
  }

  // This is a GUESS for the Apollo API endpoint and parameters.
  // You'll likely need to adjust this based on Apollo.io's actual API documentation.
  const API_URL = 'https://api.apollo.io/v1/mixed_people/search';

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    // Some APIs use 'X-Api-Key', others 'Api-Key', or 'Authorization: Bearer <key>'
    // Adjust as per Apollo.io documentation. Assuming 'Api-Key' for now.
    'Api-Key': apiKey,
    // Or, if it's 'X-Api-Key':
    // 'X-Api-Key': apiKey,
  };

  // This is a GUESS for the request body.
  const body = JSON.stringify({
    // api_key: apiKey, // Sometimes API key is in body
    q_organization_domains: domain,
    // person_titles: ["Sales", "Marketing"], // Example: if you want to filter by title
    page_size: maxEmailsPerDomain, // How many results to fetch
    // "page": 1, // for pagination
  });

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Apollo.io API error for domain ${domain}: ${response.status} ${response.statusText}`, errorBody);
      // Consider how to handle different error types (401 for auth, 429 for rate limit etc.)
      if (response.status === 401) {
        // Handle unauthorized error specifically if needed
      }
      return [];
    }

    const data: unknown = await response.json();
    const parsedData = ApolloSearchResponseSchema.safeParse(data);

    if (!parsedData.success) {
      console.error(`Failed to parse Apollo.io response for domain ${domain}:`, parsedData.error, 'Original data:', data);
      return [];
    }

    const emails = parsedData.data.people
      .map(person => person.email)
      .filter(email => email !== null && email.trim() !== '') as string[];
    
    return emails.slice(0, maxEmailsPerDomain);

  } catch (error) {
    console.error(`Network or unexpected error during Apollo.io API call for domain ${domain}:`, error);
    return [];
  }
}
