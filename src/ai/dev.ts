
import { config } from 'dotenv';
config();



import '@/ai/flows/find-emails-by-criteria.ts';
import '@/ai/flows/extract-emails-from-text.ts';
import '@/ai/flows/generate-emails-from-names-in-text.ts'; // Added import for the new flow
import '@/ai/flows/text-to-speech-flow.ts';
import '@/ai/tools/validate-email-tool.ts';
import '@/ai/tools/find-apollo-emails-tool.ts'; // Added import for the new Apollo tool

