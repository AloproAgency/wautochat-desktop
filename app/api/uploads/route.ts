import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!file || !(file instanceof File)) {
      return Response.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return Response.json(
        { success: false, error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB)` },
        { status: 400 }
      );
    }

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Keep original extension; sanitize name
    const originalName = file.name || 'file';
    const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const safeExt = ext || '';
    const filename = `${uuidv4()}${safeExt}`;
    const fullPath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buffer);

    // Public URL served by Next.js from /public
    const url = `/uploads/${filename}`;

    return Response.json({
      success: true,
      data: {
        url,
        filename: originalName,
        size: file.size,
        mimeType: file.type,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
