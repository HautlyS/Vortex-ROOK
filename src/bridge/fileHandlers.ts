// Browser File API handlers for web environment

export interface FilePickerOptions {
  accept?: string[];
  multiple?: boolean;
}

export interface FileSaveOptions {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

/**
 * Open file picker and read file as ArrayBuffer
 */
export async function pickFile(options: FilePickerOptions = {}): Promise<{ name: string; data: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept?.join(',') || '';
    input.multiple = options.multiple || false;

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const buffer = await file.arrayBuffer();
      resolve({
        name: file.name,
        data: new Uint8Array(buffer),
      });
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Pick multiple files
 */
export async function pickFiles(options: FilePickerOptions = {}): Promise<Array<{ name: string; data: Uint8Array }>> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept?.join(',') || '';
    input.multiple = true;

    input.onchange = async () => {
      const files = input.files;
      if (!files || files.length === 0) {
        resolve([]);
        return;
      }

      const results = await Promise.all(
        Array.from(files).map(async (file) => ({
          name: file.name,
          data: new Uint8Array(await file.arrayBuffer()),
        }))
      );
      resolve(results);
    };

    input.oncancel = () => resolve([]);
    input.click();
  });
}

/**
 * Download data as file using Blob
 */
export function downloadFile(data: Uint8Array | string, filename: string, mimeType: string): void {
  const blobData = data instanceof Uint8Array 
    ? new Blob([new Uint8Array(data)], { type: mimeType }) 
    : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blobData);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Cleanup URL after download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bookproj: 'application/json',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Get file extension from format
 */
export function getExtension(format: string): string {
  const extensions: Record<string, string> = {
    pdf: '.pdf',
    docx: '.docx',
    bookproj: '.bookproj',
    png: '.png',
    zip: '.zip',
  };
  return extensions[format] || '';
}

/**
 * Create ZIP file from multiple blobs using JSZip-like approach
 * Uses compression for smaller file sizes
 */
export async function createZipFromBlobs(
  files: Array<{ name: string; data: Blob | Uint8Array }>,
  compressionLevel: number = 6
): Promise<Blob> {
  // Dynamic import JSZip
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  
  for (const file of files) {
    const data = file.data instanceof Blob 
      ? await file.data.arrayBuffer() 
      : file.data;
    zip.file(file.name, data, { 
      compression: compressionLevel > 0 ? 'DEFLATE' : 'STORE',
      compressionOptions: { level: compressionLevel }
    });
  }
  
  return zip.generateAsync({ 
    type: 'blob',
    compression: compressionLevel > 0 ? 'DEFLATE' : 'STORE',
    compressionOptions: { level: compressionLevel }
  });
}
