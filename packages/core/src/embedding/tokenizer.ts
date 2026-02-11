/**
 * BERT WordPiece Tokenizer
 * Pure TypeScript implementation — no external dependencies
 * Compatible with 'bert-base-uncased' vocabulary format
 */

import { readFile } from 'fs/promises';

const UNK_TOKEN = '[UNK]';
const CLS_TOKEN = '[CLS]';
const SEP_TOKEN = '[SEP]';
const PAD_TOKEN = '[PAD]';
const MAX_WORD_LEN = 200;

export interface TokenizerOutput {
  inputIds: bigint[];
  attentionMask: bigint[];
  tokenTypeIds: bigint[];
}

export class BertTokenizer {
  private vocab: Map<string, number> = new Map();
  private unkTokenId = 100;
  private clsTokenId = 101;
  private sepTokenId = 102;
  private padTokenId = 0;
  private readonly maxLength: number;
  private readonly vocabPath: string;
  private loaded = false;

  constructor(vocabPath: string, maxLength = 256) {
    this.vocabPath = vocabPath;
    this.maxLength = maxLength;
  }

  async load(): Promise<void> {
    const content = await readFile(this.vocabPath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const token = lines[i]!.trimEnd();
      if (token.length > 0) {
        this.vocab.set(token, i);
      }
    }

    // Resolve special token IDs
    this.unkTokenId = this.vocab.get(UNK_TOKEN) ?? 100;
    this.clsTokenId = this.vocab.get(CLS_TOKEN) ?? 101;
    this.sepTokenId = this.vocab.get(SEP_TOKEN) ?? 102;
    this.padTokenId = this.vocab.get(PAD_TOKEN) ?? 0;
    this.loaded = true;
  }

  encode(text: string): TokenizerOutput {
    if (!this.loaded) {
      throw new Error('Tokenizer not loaded. Call load() first.');
    }

    // Lowercase + basic cleanup
    const cleaned = text.toLowerCase().replace(/[\t\n\r]/g, ' ');

    // Basic whitespace tokenization
    const words = cleaned.split(/\s+/).filter(w => w.length > 0);

    // WordPiece tokenization
    const tokenIds: number[] = [this.clsTokenId];

    for (const word of words) {
      if (tokenIds.length >= this.maxLength - 1) break;

      const subTokens = this.wordPieceTokenize(word);
      for (const subToken of subTokens) {
        if (tokenIds.length >= this.maxLength - 1) break;
        tokenIds.push(subToken);
      }
    }

    tokenIds.push(this.sepTokenId);

    // Pad to maxLength
    const inputIds: bigint[] = new Array(this.maxLength);
    const attentionMask: bigint[] = new Array(this.maxLength);
    const tokenTypeIds: bigint[] = new Array(this.maxLength);

    for (let i = 0; i < this.maxLength; i++) {
      if (i < tokenIds.length) {
        inputIds[i] = BigInt(tokenIds[i]!);
        attentionMask[i] = 1n;
      } else {
        inputIds[i] = BigInt(this.padTokenId);
        attentionMask[i] = 0n;
      }
      tokenTypeIds[i] = 0n;
    }

    return { inputIds, attentionMask, tokenTypeIds };
  }

  private wordPieceTokenize(word: string): number[] {
    if (word.length > MAX_WORD_LEN) {
      return [this.unkTokenId];
    }

    const tokens: number[] = [];
    let start = 0;

    while (start < word.length) {
      let end = word.length;
      let found = false;

      while (start < end) {
        const substr = start === 0 ? word.slice(start, end) : `##${word.slice(start, end)}`;
        const id = this.vocab.get(substr);

        if (id !== undefined) {
          tokens.push(id);
          found = true;
          start = end;
          break;
        }

        end--;
      }

      if (!found) {
        // Character not in vocab, use [UNK]
        tokens.push(this.unkTokenId);
        start++;
      }
    }

    return tokens;
  }
}
