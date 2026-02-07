/**
 * API route for AI-powered code explanation
 * POST /api/explain
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { generateExplanation } from '@/lib/ai';
import type { ExplainRequest, ExplainResult, ExplainError } from '@/types/explain';

// Repository path - defaults to current working directory
const REPO_PATH = process.env.REPO_PATH || process.cwd();

export async function POST(request: Request) {
  try {
    const body: ExplainRequest = await request.json();
    const { sourceFile, targetFile } = body;

    if (!sourceFile || !targetFile) {
      return NextResponse.json<ExplainError>(
        { code: 'UNKNOWN', message: 'Missing sourceFile or targetFile' },
        { status: 400 }
      );
    }

    // Read current file contents
    const [sourceContent, targetContent] = await Promise.all([
      readFile(sourceFile),
      readFile(targetFile),
    ]);

    if (sourceContent === null) {
      return NextResponse.json<ExplainError>(
        { code: 'FILE_NOT_FOUND', message: `Cannot read file: ${sourceFile}` },
        { status: 404 }
      );
    }

    if (targetContent === null) {
      return NextResponse.json<ExplainError>(
        { code: 'FILE_NOT_FOUND', message: `Cannot read file: ${targetFile}` },
        { status: 404 }
      );
    }

    // Try to get the base branch version of the target file
    const targetBaseBranch = await getFileAtBaseBranch(targetFile);

    // Generate explanation using AI
    const result = await generateExplanation(
      { path: sourceFile, content: sourceContent },
      { path: targetFile, content: targetContent },
      targetBaseBranch
    );

    return NextResponse.json<ExplainResult>(result);
  } catch (error) {
    console.error('Explain API error:', error);

    if (error instanceof Error) {
      switch (error.message) {
        case 'NO_API_KEY':
          return NextResponse.json<ExplainError>(
            { code: 'NO_API_KEY', message: 'Please set GOOGLE_AI_API_KEY in .env.local' },
            { status: 500 }
          );
        case 'RATE_LIMIT':
          return NextResponse.json<ExplainError>(
            { code: 'RATE_LIMIT', message: 'Too many requests, please try again later' },
            { status: 429 }
          );
        case 'NETWORK_ERROR':
          return NextResponse.json<ExplainError>(
            { code: 'NETWORK_ERROR', message: 'Unable to connect to AI service' },
            { status: 503 }
          );
      }
    }

    return NextResponse.json<ExplainError>(
      { code: 'UNKNOWN', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

/**
 * Read a file from the repository
 */
async function readFile(filePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(REPO_PATH, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch {
    return null;
  }
}

/**
 * Get the content of a file at the base branch (main or master)
 */
async function getFileAtBaseBranch(filePath: string): Promise<string | null> {
  try {
    const git = simpleGit(REPO_PATH);

    // Check if this is a git repo
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return null;
    }

    // Detect base branch
    const branches = await git.branch(['-a']);
    let baseBranch: string | null = null;

    if (branches.all.includes('main') || branches.all.includes('remotes/origin/main')) {
      baseBranch = 'main';
    } else if (branches.all.includes('master') || branches.all.includes('remotes/origin/master')) {
      baseBranch = 'master';
    }

    if (!baseBranch) {
      return null;
    }

    // Get file content at base branch
    // Normalize path for git (use forward slashes)
    const normalizedPath = filePath.replace(/\\/g, '/');
    const content = await git.show([`${baseBranch}:${normalizedPath}`]);
    return content;
  } catch {
    return null;
  }
}
