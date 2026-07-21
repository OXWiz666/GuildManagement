import { createWorker, type Worker } from "tesseract.js";
import { env } from "../config/env.js";
import { logger, errorFields } from "../utils/logger.js";
import { UserFacingError } from "../utils/errors.js";

export interface OcrOutput {
  text: string;
  /** Page-level confidence, 0..1. */
  confidence: number;
  /** Wall-clock OCR duration, for logging. */
  ms: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLayoutOutput extends OcrOutput {
  words: OcrWord[];
}

interface RecognitionOptions {
  languages?: string;
}

/** Content types Discord serves for images we can actually read. */
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"]);

/**
 * Server-side OCR.
 *
 * Three things make this different from the browser scanner in apps/web:
 *
 * 1. **One reused worker.** Initializing tesseract downloads ~15MB of language
 *    data and spins up a WASM runtime — doing that per scan would make the
 *    first `!cp` of every scan take ~10s and thrash memory on a 512MB Fly VM.
 *    The worker is created lazily on first use and kept alive.
 *
 * 2. **Serialized.** A tesseract Worker is not safe for concurrent `recognize`
 *    calls. Scans are chained so two members scanning at once queue rather
 *    than corrupt each other's results.
 *
 * 3. **Bounded.** Untrusted input from Discord: the image is size- and
 *    type-checked before download, and recognition is under a timeout so a
 *    pathological image can't wedge the single worker forever.
 */
export class OcrService {
  private worker: Worker | null = null;
  private workerInit: Promise<Worker> | null = null;
  private workerLanguages: string | null = null;
  /** Tail of the serialization chain; every scan links onto it. */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Get (or lazily create) the shared worker.
   *
   * The in-flight promise is cached too, so several simultaneous first-scans
   * await one initialization instead of racing to create three workers.
   */
  private async getWorker(languages: string): Promise<Worker> {
    const desiredLanguages = normalizeLanguageList(languages);
    if (this.worker) {
      if (this.workerLanguages !== desiredLanguages) {
        const started = Date.now();
        logger.info("Switching OCR worker languages", {
          from: this.workerLanguages,
          to: desiredLanguages,
        });
        await this.worker.reinitialize(desiredLanguages);
        this.workerLanguages = desiredLanguages;
        logger.info("OCR worker language switch complete", {
          languages: desiredLanguages,
          ms: Date.now() - started,
        });
      }
      return this.worker;
    }
    if (this.workerInit) return this.workerInit;

    this.workerInit = (async () => {
      const started = Date.now();
      logger.info("Initializing OCR worker (first scan downloads language data)", {
        languages: desiredLanguages,
      });

      const worker = await createWorker(desiredLanguages, undefined, {
        // Persist traineddata across restarts. In Docker this path should be on
        // a layer or volume; otherwise every cold start re-downloads ~15MB.
        cachePath: env.OCR_CACHE_PATH,
        // tesseract.js logs verbosely at info level; route it to debug.
        logger: (m: { status: string; progress: number }) => {
          logger.debug("OCR progress", { status: m.status, progress: m.progress });
        },
      });

      this.worker = worker;
      this.workerLanguages = desiredLanguages;
      logger.info("OCR worker ready", { ms: Date.now() - started });
      return worker;
    })();

    try {
      return await this.workerInit;
    } catch (error) {
      // Reset so a transient failure (e.g. CDN blip fetching traineddata)
      // doesn't permanently poison every future scan.
      this.workerInit = null;
      throw error;
    }
  }

  /**
   * Download a Discord attachment.
   *
   * Validates BEFORE reading the body: an attacker-supplied URL could point at
   * a multi-GB file, and streaming it into memory first would defeat the check.
   */
  async fetchImage(url: string, declaredSize: number, contentType: string | null): Promise<Buffer> {
    if (declaredSize > env.OCR_MAX_IMAGE_BYTES) {
      throw new UserFacingError(
        `That image is too large (${(declaredSize / 1_048_576).toFixed(1)}MB).`,
        `Screenshots must be under ${Math.floor(env.OCR_MAX_IMAGE_BYTES / 1_048_576)}MB.`,
      );
    }

    // Discord reports the type; normalize off any "; charset=" suffix.
    const mime = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
    if (mime && !ALLOWED_MIME.has(mime)) {
      throw new UserFacingError(
        `\`${mime}\` isn't an image format I can read.`,
        "Attach a PNG, JPG or WEBP screenshot.",
      );
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(env.OCR_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new UserFacingError(
        "Couldn't download that screenshot from Discord.",
        "Try re-uploading it.",
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Re-check the real size: `declaredSize` came from Discord's metadata, and
    // trusting metadata over the actual bytes is how size limits get bypassed.
    if (buffer.byteLength > env.OCR_MAX_IMAGE_BYTES) {
      throw new UserFacingError("That image is too large.");
    }

    return buffer;
  }

  /**
   * Recognize text in an image. Serialized behind the shared worker and
   * bounded by a timeout.
   */
  async recognize(image: Buffer, options: RecognitionOptions = {}): Promise<OcrOutput> {
    // Link onto the queue tail. `.then(noop, noop)` so a previous scan's
    // failure doesn't reject this one — each scan owns its own errors.
    const languages = options.languages ?? env.OCR_CP_LANGUAGES;
    const run = this.queue.then(
      () => this.recognizeNow(image, languages),
      () => this.recognizeNow(image, languages),
    );

    // The queue tracks completion, not success.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  async recognizeLayout(image: Buffer, options: RecognitionOptions = {}): Promise<OcrLayoutOutput> {
    const languages = options.languages ?? env.OCR_CP_LANGUAGES;
    const run = this.queue.then(
      () => this.recognizeLayoutNow(image, languages),
      () => this.recognizeLayoutNow(image, languages),
    );

    this.queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  private async recognizeNow(image: Buffer, languages: string): Promise<OcrOutput> {
    const worker = await this.getWorker(languages);
    const started = Date.now();

    try {
      const result = await withTimeout(
        worker.recognize(image),
        env.OCR_TIMEOUT_MS,
        "OCR timed out",
      );

      const text = result.data.text ?? "";
      // tesseract reports 0..100; the rest of the codebase uses 0..1.
      const confidence = (result.data.confidence ?? 0) / 100;

      return { text, confidence, ms: Date.now() - started };
    } catch (error) {
      logger.error("OCR failed", { ms: Date.now() - started, ...errorFields(error) });

      // A timeout may have left the worker mid-job; discard it so the next scan
      // starts from a clean runtime rather than inheriting a wedged one.
      await this.reset();

      throw new UserFacingError(
        "Couldn't read that screenshot.",
        "Make sure the Combat Power number is clearly visible, then try again — or use `!cp <value>`.",
      );
    }
  }

  private async recognizeLayoutNow(image: Buffer, languages: string): Promise<OcrLayoutOutput> {
    const worker = await this.getWorker(languages);
    const started = Date.now();

    try {
      const result = await withTimeout(
        worker.recognize(image, {}, { blocks: true }),
        env.OCR_TIMEOUT_MS,
        "OCR timed out",
      );

      const text = result.data.text ?? "";
      const confidence = (result.data.confidence ?? 0) / 100;
      const words = extractWords(result.data.blocks);

      return { text, confidence, words, ms: Date.now() - started };
    } catch (error) {
      logger.error("OCR layout failed", { ms: Date.now() - started, ...errorFields(error) });
      await this.reset();
      throw new UserFacingError(
        "Couldn't read that attendance screenshot.",
        "Make sure the rally member names are visible, then upload the screenshot again.",
      );
    }
  }

  /** Tear down the worker; the next scan lazily recreates it. */
  private async reset(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.workerInit = null;
    this.workerLanguages = null;
    if (worker) {
      await worker.terminate().catch(() => {
        // Already dead — nothing to clean up.
      });
    }
  }

  /** Release the worker on shutdown so the process can exit promptly. */
  async dispose(): Promise<void> {
    await this.reset();
  }
}

function normalizeLanguageList(languages: string): string {
  return languages
    .split(/[+,]/)
    .map((lang) => lang.trim())
    .filter(Boolean)
    .join("+") || "eng";
}

function extractWords(blocks: Tesseract.Block[] | null): OcrWord[] {
  const out: OcrWord[] = [];

  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text.trim();
          if (!text) continue;
          out.push({
            text,
            confidence: (word.confidence ?? 0) / 100,
            bbox: word.bbox,
          });
        }
      }
    }
  }

  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
