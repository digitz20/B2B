
import { config } from 'dotenv';
config();



import '@/ai/flows/find-emails-by-criteria.ts';
import '@/ai/flows/extract-emails-from-text.ts';
import '@/ai/flows/generate-emails-from-names-in-text.ts';
import '@/ai/flows/generate-emails-from-domains.ts';
// The text-to-speech-flow is no longer needed.
// The validate-email-tool is no longer needed as we are removing validation.
import '@/ai/tools/find-apollo-emails-tool.ts';
