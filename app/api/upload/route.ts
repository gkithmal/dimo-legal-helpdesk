export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const submissionId = formData.get('submissionId') as string;

    if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to /public/uploads/<submissionId>/
    const uploadDir = join(process.cwd(), 'public', 'uploads', submissionId || 'misc');
    await mkdir(uploadDir, { recursive: true });

    const filename  = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;
    const filepath  = join(uploadDir, filename);
    await writeFile(filepath, buffer);

    const publicUrl = `/uploads/${submissionId || 'misc'}/${filename}`;
    return NextResponse.json({ success: true, url: publicUrl, filename });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
