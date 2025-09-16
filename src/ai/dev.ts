
import { config } from 'dotenv';
config();



import '@/ai/flows/find-emails-by-criteria.ts';
import '@/ai/flows/extract-emails-from-text.ts';
import '@/ai/flows/generate-emails-from-names-in-text.ts';
import '@/ai/flows/generate-emails-from-domains.ts'; // Added import for the new flow
import '@/ai/flows/text-to-speech-flow.ts';
// The validate-email-tool is no longer needed as we are removing validation.
import '@/ai/tools/find-apollo-emails-tool.ts';



