/**
 * ONNX Runtime embedding engine
 * Runs a local MiniLM model to generate 384-dim sentence embeddings
 */

import { BertTokenizer } from './tokenizer.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ort: any;

export class Embedder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private tokenizer: BertTokenizer | null = null;
  private readonly modelPath: string;
  private readonly vocabPath: string;

  constructor(modelPath: string, vocabPath: string) {
    this.modelPath = modelPath;
    this.vocabPath = vocabPath;
  }

  async init(): Promise<void> {
    // Dynamic import to avoid crashes when onnxruntime-node is not available
    ort = await import('onnxruntime-node');

    // Load tokenizer
    this.tokenizer = new BertTokenizer(this.vocabPath);
    await this.tokenizer.load();

    // Load ONNX session
    this.session = await ort.InferenceSession.create(this.modelPath, {
      executionProviders: ['cpu'],
    });
  }

  async embed(text: string): Promise<number[]> {
    if (!this.session || !this.tokenizer) {
      throw new Error('Embedder not initialized. Call init() first.');
    }

    // Tokenize
    const { inputIds, attentionMask, tokenTypeIds } = this.tokenizer.encode(text);
    const seqLen = inputIds.length;

    // Create ONNX tensors
    const inputIdsTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds), [1, seqLen]);
    const attentionMaskTensor = new ort.Tensor('int64', BigInt64Array.from(attentionMask), [1, seqLen]);
    const tokenTypeIdsTensor = new ort.Tensor('int64', BigInt64Array.from(tokenTypeIds), [1, seqLen]);

    // Run inference
    const results = await this.session.run({
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
      token_type_ids: tokenTypeIdsTensor,
    });

    // Get last_hidden_state [1, seq_len, 384]
    const outputKey = results['last_hidden_state'] ? 'last_hidden_state' : Object.keys(results)[0]!;
    const output = results[outputKey];
    const hiddenState: Float32Array = output.data;
    const hiddenSize: number = output.dims[2];

    // Mean pooling with attention mask
    const pooled = new Array<number>(hiddenSize).fill(0);
    let maskSum = 0;

    for (let i = 0; i < seqLen; i++) {
      const mask = Number(attentionMask[i]);
      if (mask === 0) continue;
      maskSum += mask;

      const offset = i * hiddenSize;
      for (let j = 0; j < hiddenSize; j++) {
        pooled[j] = pooled[j]! + hiddenState[offset + j]! * mask;
      }
    }

    if (maskSum > 0) {
      for (let j = 0; j < hiddenSize; j++) {
        pooled[j] = pooled[j]! / maskSum;
      }
    }

    // L2 normalization
    let norm = 0;
    for (let j = 0; j < hiddenSize; j++) {
      norm += pooled[j]! * pooled[j]!;
    }
    norm = Math.sqrt(norm);

    const result = new Array<number>(hiddenSize);
    if (norm > 0) {
      for (let j = 0; j < hiddenSize; j++) {
        result[j] = pooled[j]! / norm;
      }
    } else {
      result.fill(0);
    }

    return result;
  }

  dispose(): void {
    this.session = null;
    this.tokenizer = null;
  }
}
