/**
 * AI client for generating code explanations using Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ExplainResult } from '@/types/explain';

const API_KEY = process.env.GOOGLE_AI_API_KEY;

/**
 * Generate an explanation for a broken dependency
 * @param sourceFile - Content and path of the importing file
 * @param targetFile - Content and path of the file that was changed
 * @param targetBaseBranch - Content of target file in the base branch
 */
export async function generateExplanation(
  sourceFile: { path: string; content: string },
  targetFile: { path: string; content: string },
  targetBaseBranch: string | null
): Promise<ExplainResult> {
  if (!API_KEY) {
    throw new Error('NO_API_KEY');
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = buildPrompt(sourceFile, targetFile, targetBaseBranch);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    return parseResponse(text);
  } catch (error) {
    console.error('Gemini API error:', error);
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('429') || message.includes('quota') || message.includes('rate')) {
        throw new Error('RATE_LIMIT');
      }
      if (message.includes('api key') || message.includes('api_key') || message.includes('invalid')) {
        throw new Error('NO_API_KEY');
      }
      if (message.includes('fetch') || message.includes('network') || message.includes('enotfound')) {
        throw new Error('NETWORK_ERROR');
      }
    }
    throw error;
  }
}

function buildPrompt(
  sourceFile: { path: string; content: string },
  targetFile: { path: string; content: string },
  targetBaseBranch: string | null
): string {
  const baseComparison = targetBaseBranch
    ? `
## Target file BEFORE changes (base branch):
\`\`\`typescript
${targetBaseBranch}
\`\`\`
`
    : '(Base branch version not available)';

  return `You are a code analysis assistant. Analyze why a dependency relationship might be broken.

## Context
The source file imports from the target file. The target file's exports have changed, but the source file hasn't been updated. This might cause issues.

## Source file (${sourceFile.path}) - the importer:
\`\`\`typescript
${sourceFile.content}
\`\`\`

## Target file AFTER changes (${targetFile.path}) - current version:
\`\`\`typescript
${targetFile.content}
\`\`\`

${baseComparison}

## Task
Analyze the code and provide a brief, practical explanation in the following JSON format:

\`\`\`json
{
  "whatChanged": "Brief description of what exports changed in the target file (1-2 sentences)",
  "whyBreaking": "Explanation of why this might break the source file's usage (1-2 sentences)",
  "howToFix": "Practical steps to fix the issue in the source file (1-3 bullet points)"
}
\`\`\`

Important:
- Keep each section concise and actionable
- Focus on the specific imports used by the source file
- If you cannot determine a breaking change, explain what might need manual review
- Respond ONLY with the JSON object, no additional text
`;
}

function parseResponse(text: string): ExplainResult {
  // Extract JSON from the response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      whatChanged: 'Unable to parse AI response',
      whyBreaking: 'The response format was unexpected',
      howToFix: 'Please try again or review the code manually',
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      whatChanged: parsed.whatChanged || 'No changes detected',
      whyBreaking: parsed.whyBreaking || 'Unable to determine',
      howToFix: parsed.howToFix || 'Review the code manually',
    };
  } catch {
    return {
      whatChanged: 'Unable to parse AI response',
      whyBreaking: 'The response format was unexpected',
      howToFix: 'Please try again or review the code manually',
    };
  }
}
