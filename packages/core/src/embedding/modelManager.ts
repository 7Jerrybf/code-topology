/**
 * Model download manager for embedding models
 * Downloads ONNX model and vocabulary from HuggingFace Hub on first use
 */

import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import https from 'https';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MODEL_FILES = {
  vocab: {
    url: `https://huggingface.co/${MODEL_ID}/resolve/main/vocab.txt`,
    filename: 'vocab.txt',
  },
  model: {
    url: `https://huggingface.co/${MODEL_ID}/resolve/main/onnx/model_quantized.onnx`,
    filename: 'model_quantized.onnx',
  },
};

export class ModelManager {
  private readonly modelsDir: string;

  constructor(repoRoot: string, cacheDir?: string) {
    const baseDir = cacheDir ?? join(repoRoot, '.topology');
    this.modelsDir = join(baseDir, 'models');
  }

  get modelId(): string {
    return MODEL_ID;
  }

  isModelDownloaded(): boolean {
    return (
      existsSync(join(this.modelsDir, MODEL_FILES.vocab.filename)) &&
      existsSync(join(this.modelsDir, MODEL_FILES.model.filename))
    );
  }

  async ensureModel(): Promise<{ modelPath: string; vocabPath: string }> {
    const modelPath = join(this.modelsDir, MODEL_FILES.model.filename);
    const vocabPath = join(this.modelsDir, MODEL_FILES.vocab.filename);

    if (this.isModelDownloaded()) {
      return { modelPath, vocabPath };
    }

    // Ensure models directory exists
    if (!existsSync(this.modelsDir)) {
      mkdirSync(this.modelsDir, { recursive: true });
    }

    console.log(`\u{1F4E6} Downloading embedding model (${MODEL_ID})...`);

    // Download vocab first (small)
    if (!existsSync(vocabPath)) {
      await this.downloadFile(MODEL_FILES.vocab.url, vocabPath, 'vocab.txt');
    }

    // Download model (larger, ~23MB)
    if (!existsSync(modelPath)) {
      await this.downloadFile(MODEL_FILES.model.url, modelPath, 'model_quantized.onnx (~23MB)');
    }

    console.log(`\u2705 Embedding model ready`);
    return { modelPath, vocabPath };
  }

  private downloadFile(url: string, destPath: string, label: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Download timed out for ${label}`));
      }, 120_000); // 2 minutes timeout

      const doRequest = (requestUrl: string, redirectCount: number) => {
        if (redirectCount > 5) {
          clearTimeout(timeout);
          reject(new Error(`Too many redirects for ${label}`));
          return;
        }

        https.get(requestUrl, (response) => {
          // Handle redirects
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume(); // Drain the response
            doRequest(response.headers.location, redirectCount + 1);
            return;
          }

          if (response.statusCode !== 200) {
            clearTimeout(timeout);
            response.resume();
            reject(new Error(`Failed to download ${label}: HTTP ${response.statusCode}`));
            return;
          }

          const file = createWriteStream(destPath);
          response.pipe(file);

          file.on('finish', () => {
            clearTimeout(timeout);
            file.close();
            console.log(`   \u2713 Downloaded ${label}`);
            resolve();
          });

          file.on('error', (err) => {
            clearTimeout(timeout);
            file.close();
            reject(err);
          });
        }).on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      };

      doRequest(url, 0);
    });
  }
}
