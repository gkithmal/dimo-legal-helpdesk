export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comments = await prisma.submissionComment.findMany({
      where: { submissionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ success: true, data: comments });
  } catch (error) {
    console.error('GET comments error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { authorName, authorRole, text } = body;
    if (!authorName || !authorRole || !text?.trim()) {
      return NextResponse.json({ success: false, error: 'authorName, authorRole and text are required' }, { status: 400 });
    }
    const comment = await prisma.submissionComment.create({
      data: { submissionId: id, authorName, authorRole, text: text.trim() },
    });
    return NextResponse.json({ success: true, data: comment });
  } catch (error) {
    console.error('POST comment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to post comment' }, { status: 500 });
  }
}
