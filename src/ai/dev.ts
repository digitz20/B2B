
import { config } from 'dotenv';
config();

import '@/ai/flows/find-emails-by-criteria.ts';
import '@/ai/flows/extract-emails-from-text.ts';
import '@/ai/tools/validate-email-tool.ts'; // Added import for the new tool
