
'use server';
/**
 * @fileOverview Calls a custom backend endpoint to scrape emails from a list of websites.
 *
 * - generateEmailsFromDomains - A function that handles the email scraping process.
 * - GenerateEmailsFromDomainsInput - The input type for the function.
 * - GenerateEmailsFromDomainsOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateEmailsFromDomainsInputSchema = z.object({
  textBlock: z.string().describe('A block of text containing company websites or domains (e.g., https://www.uber.com, example.com).'),
});
export type GenerateEmailsFromDomainsInput = z.infer<typeof GenerateEmailsFromDomainsInputSchema>;

const GenerateEmailsFromDomainsOutputSchema = z.object({
  processedEmails: z.array(z.string()).describe('A list of found email addresses from the scraper.'),
  generationSummary: z.string().describe('A summary of the domains processed and the emails found.'),
});
export type GenerateEmailsFromDomainsOutput = z.infer<typeof GenerateEmailsFromDomainsOutputSchema>;

// Define a schema for the expected response from the scraper service
const ScraperResponseSchema = z.object({
  emails: z.array(z.string()).default([]),
});

export async function generateEmailsFromDomains(input: GenerateEmailsFromDomainsInput): Promise<GenerateEmailsFromDomainsOutput> {
  const customScraperUrl = 'https://emailscrapper-44wc.onrender.com/emailscrapper';

  // 1. Parse the input text block to get an array of URLs, ensuring they start with http/https.
  const urls = input.textBlock.split(/\s+/).filter(line => line.trim().startsWith('http'));

  if (urls.length === 0) {
    return {
      processedEmails: [],
      generationSummary: 'No valid website URLs were provided. Please ensure each URL starts with http or https.',
    };
  }

  try {
    // 2. Call the custom backend endpoint
    const response = await fetch(customScraperUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls: urls }), // Assuming the endpoint expects {"urls": [...]}
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Custom scraper API error: ${response.status} ${response.statusText}`, errorBody);
      throw new Error(`The email scraper service failed with status ${response.status}.`);
    }

    const data: unknown = await response.json();
    const parsedData = ScraperResponseSchema.safeParse(data);

    if (!parsedData.success) {
      console.error('Failed to parse response from custom scraper:', parsedData.error, 'Original data:', data);
      throw new Error('Received an invalid response format from the email scraper service.');
    }
    
    const emails = parsedData.data.emails;
    const uniqueEmails = Array.from(new Set(emails.map(e => e.toLowerCase())));

    return {
      processedEmails: uniqueEmails,
      generationSummary: `Processed ${urls.length} website(s) and found ${uniqueEmails.length} unique email(s) via the custom scraper.`,
    };

  } catch (error) {
    console.error('CRITICAL_ERROR in generateEmailsFromDomains (custom scraper):', error instanceof Error ? error.stack : String(error));
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return {
      processedEmails: [],
      generationSummary: `A critical error occurred while contacting the email scraper service: ${errorMessage}`,
    };
  }
}
