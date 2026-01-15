/**
 * NHTSA Flat File Downloader
 * Downloads and extracts the FLAT_CMPL.zip file from NHTSA
 * Uses streaming to handle the large file size (~1.5GB compressed)
 */

import { createWriteStream, createReadStream, existsSync } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { Extract } from 'unzipper';

/**
 * NHTSA flat file download URL
 */
export const NHTSA_FLAT_FILE_URL =
  'https://static.nhtsa.gov/odi/ffdd/cmpl/FLAT_CMPL.zip';

/**
 * Download progress information
 */
export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
}

/**
 * Download options
 */
export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  url?: string;
}

/**
 * Download result
 */
export interface DownloadResult {
  success: boolean;
  filePath: string;
  size: number;
  duration: number;
}

/**
 * Extract result
 */
export interface ExtractResult {
  success: boolean;
  filePath: string;
  size: number;
}

/**
 * Download the NHTSA flat file zip to the specified directory
 * Uses streaming to avoid loading the entire file into memory
 * @param destDir - Destination directory for the download
 * @param options - Download options including progress callback
 * @returns Download result with file path and metadata
 */
export async function downloadFlatFile(
  destDir: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const { onProgress, url = NHTSA_FLAT_FILE_URL } = options;
  const startTime = Date.now();

  // Ensure destination directory exists
  await mkdir(destDir, { recursive: true });

  const zipFileName = 'FLAT_CMPL.zip';
  const zipFilePath = path.join(destDir, zipFileName);

  // Initiate download
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
  let bytesDownloaded = 0;

  // Create write stream
  const writeStream = createWriteStream(zipFilePath);

  // Get reader from response body
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body available');
  }

  // Stream the download
  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Write chunk to file
      writeStream.write(value);
      bytesDownloaded += value.length;

      // Report progress
      if (onProgress && totalBytes > 0) {
        onProgress({
          bytesDownloaded,
          totalBytes,
          percentage: Math.round((bytesDownloaded / totalBytes) * 100),
        });
      }
    }

    // Close the write stream
    writeStream.end();

    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Final progress update
    if (onProgress) {
      onProgress({
        bytesDownloaded,
        totalBytes: totalBytes || bytesDownloaded,
        percentage: 100,
      });
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      filePath: zipFilePath,
      size: bytesDownloaded,
      duration,
    };
  } catch (error) {
    // Clean up partial file on error
    try {
      await rm(zipFilePath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Extract FLAT_CMPL.txt from the downloaded zip file
 * @param zipPath - Path to the zip file
 * @param destDir - Destination directory for extraction
 * @returns Extract result with file path
 */
export async function extractFlatFile(
  zipPath: string,
  destDir: string
): Promise<ExtractResult> {
  // Check zip file exists
  if (!existsSync(zipPath)) {
    throw new Error(`Zip file not found: ${zipPath}`);
  }

  // Ensure destination directory exists
  await mkdir(destDir, { recursive: true });

  const extractedPath = path.join(destDir, 'FLAT_CMPL.txt');

  // Extract using unzipper
  await pipeline(
    createReadStream(zipPath),
    Extract({ path: destDir })
  );

  // Verify extraction
  if (!existsSync(extractedPath)) {
    throw new Error('Extraction failed: FLAT_CMPL.txt not found');
  }

  const stats = await stat(extractedPath);

  return {
    success: true,
    filePath: extractedPath,
    size: stats.size,
  };
}

/**
 * Get a readable stream for the flat file
 * Can be used with parseFlatFileStream for processing
 * @param filePath - Path to the FLAT_CMPL.txt file
 * @returns Readable stream
 */
export function getFlatFileStream(filePath: string): Readable {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return createReadStream(filePath, { encoding: 'utf-8' });
}

/**
 * Download and extract the flat file in one operation
 * @param workDir - Working directory for download and extraction
 * @param options - Download options
 * @returns Path to the extracted FLAT_CMPL.txt
 */
export async function downloadAndExtract(
  workDir: string,
  options: DownloadOptions = {}
): Promise<string> {
  // Download
  const downloadResult = await downloadFlatFile(workDir, options);

  // Extract
  const extractResult = await extractFlatFile(downloadResult.filePath, workDir);

  // Clean up zip file to save space
  try {
    await rm(downloadResult.filePath, { force: true });
  } catch {
    // Ignore cleanup errors
  }

  return extractResult.filePath;
}

export default {
  downloadFlatFile,
  extractFlatFile,
  getFlatFileStream,
  downloadAndExtract,
  NHTSA_FLAT_FILE_URL,
};
