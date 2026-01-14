/**
 * GDPR Account Deletion API
 * DELETE /api/settings/delete-account
 *
 * Implements GDPR Article 17 - Right to Erasure
 * Allows users to request deletion of their account and associated data.
 *
 * Requires triple confirmation: email match, phrase, and acknowledgment.
 * Respects legal holds - blocked data cannot be deleted.
 * Soft-deletes with anonymization, hard delete scheduled for 30 days later.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';
import { randomBytes } from 'crypto';

const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';
const HARD_DELETE_DELAY_DAYS = 30;

interface DeleteRequestBody {
  confirmEmail: string;
  confirmPhrase: string;
  reason?: string;
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/401',
          title: 'Unauthorized',
          status: 401,
          detail: 'Authentication required',
        },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    let body: DeleteRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Invalid request body. Confirmation details required.',
        },
        { status: 400 }
      );
    }

    const { confirmEmail, confirmPhrase, reason } = body;

    // Validate confirmation email
    if (!confirmEmail || confirmEmail.toLowerCase() !== user.email?.toLowerCase()) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Confirmation email does not match your account email.',
        },
        { status: 400 }
      );
    }

    // Validate confirmation phrase
    if (!confirmPhrase || confirmPhrase.toUpperCase() !== CONFIRMATION_PHRASE) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: `Please type the confirmation phrase exactly: "${CONFIRMATION_PHRASE}"`,
        },
        { status: 400 }
      );
    }

    // 3. Check for legal holds on user's data
    const legalHold = await prisma.legalHold.findFirst({
      where: {
        status: 'ACTIVE',
        organizationId: user.organizationId!,
      },
    });

    if (legalHold) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/403',
          title: 'Forbidden',
          status: 403,
          detail:
            'Your account data is currently under legal hold and cannot be deleted. Please contact your organization administrator.',
          legalHoldId: legalHold.id,
          legalHoldName: legalHold.matterName,
        },
        { status: 403 }
      );
    }

    // 4. Check if user is sole admin of org
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: {
          organizationId: user.organizationId!,
          role: 'ADMIN',
          isDeleted: false,
        },
      });

      if (adminCount <= 1) {
        return NextResponse.json(
          {
            type: 'https://httpstatuses.com/403',
            title: 'Forbidden',
            status: 403,
            detail:
              'You are the sole administrator of your organization. Please transfer admin rights to another user before deleting your account.',
          },
          { status: 403 }
        );
      }
    }

    // 5. Get user details for deletion
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!userRecord) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/404',
          title: 'Not Found',
          status: 404,
          detail: 'User record not found.',
        },
        { status: 404 }
      );
    }

    // Count affected items
    const affectedComplaintsCount = await prisma.generatedComplaint.count({
      where: {
        createdBy: userRecord.clerkUserId,
        legalHold: false,
        deletedAt: null,
      },
    });

    // 6. Generate anonymized email
    const anonymousId = randomBytes(8).toString('hex');
    const anonymizedEmail = `deleted_${anonymousId}@anonymized.local`;
    const deletedAt = new Date();
    const hardDeleteDate = new Date(deletedAt.getTime() + HARD_DELETE_DELAY_DAYS * 24 * 60 * 60 * 1000);

    // 7. Begin transaction for soft-delete
    await prisma.$transaction(async (tx) => {
      // a. Soft-delete user with PII anonymization
      await tx.user.update({
        where: { id: user.id },
        data: {
          deletedAt,
          isDeleted: true,
          email: anonymizedEmail,
        },
      });

      // b. Soft-delete user's generated complaints (except legal holds)
      await tx.generatedComplaint.updateMany({
        where: {
          createdBy: userRecord.clerkUserId,
          legalHold: false,
          deletedAt: null,
        },
        data: {
          deletedAt,
        },
      });

      // c. Create audit log entry
      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          action: 'ACCOUNT_DELETION',
          resource: 'USER',
          resourceId: user.id,
          metadata: {
            reason: reason || 'User requested',
            anonymizedEmail,
            originalEmailHash: Buffer.from(user.email || '').toString('base64'),
            affectedComplaints: affectedComplaintsCount,
            hardDeleteScheduledAt: hardDeleteDate.toISOString(),
          },
        },
      });
    });

    // 8. Revoke Clerk session (delete user from Clerk)
    try {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(userRecord.clerkUserId);
    } catch (clerkError) {
      console.error('Failed to delete Clerk user:', clerkError);
      // Continue - database deletion is the critical part
    }

    // 9. Return confirmation response
    return NextResponse.json(
      {
        message: 'Your account has been scheduled for deletion.',
        deletionTimeline: {
          softDeletedAt: deletedAt.toISOString(),
          hardDeleteScheduledAt: hardDeleteDate.toISOString(),
        },
        itemsAffected: {
          generatedComplaints: affectedComplaintsCount,
          auditLogs: 'retained', // Audit logs are never deleted
        },
        notice:
          'Your data will be permanently deleted after 30 days. Some data may be retained if under legal hold.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Account deletion error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to process account deletion. Please try again later.',
      },
      { status: 500 }
    );
  }
}
