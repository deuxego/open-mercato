import { expect, test } from '@playwright/test';
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api';
import {
  acquireRecordLock,
  cleanupTodo,
  createTodoFixture,
  buildScopeCookieFromToken,
  getTodoTitle,
  getRecordLockSettings,
  releaseRecordLock,
  saveRecordLockSettings,
  updateTodo,
  waitForNotification,
  LOCK_RESOURCE_KIND,
  type RecordLockSettings,
} from './helpers/recordLocks';

/**
 * TC-LOCK-004: Merged conflict resolution and notification
 */
test.describe('TC-LOCK-004: Merged conflict resolution and notification', () => {
  test.describe.configure({ timeout: 90_000 });

  test('should resolve conflict with merged resolution and notify incoming actor', async ({ request }) => {
    const superadminToken = await getAuthToken(request, 'superadmin');
    const adminToken = await getAuthToken(request, 'admin');
    const superadminScopeCookie = buildScopeCookieFromToken(superadminToken);
    const superadminScopeHeaders = superadminScopeCookie ? { cookie: superadminScopeCookie } : undefined;

    let previousSettings: RecordLockSettings | null = null;
    let todoId: string | null = null;
    let ownerLockToken: string | null = null;

    try {
      previousSettings = await getRecordLockSettings(request, superadminToken);
      await saveRecordLockSettings(request, superadminToken, {
        ...previousSettings,
        enabled: true,
        strategy: 'optimistic',
        enabledResources: [LOCK_RESOURCE_KIND],
        notifyOnConflict: true,
      });

      todoId = await createTodoFixture(request, adminToken, `QA TC-LOCK-004 Todo ${Date.now()}`);

      const acquire = await acquireRecordLock(
        request,
        superadminToken,
        LOCK_RESOURCE_KIND,
        todoId,
        superadminScopeHeaders,
      );
      expect(acquire.status).toBe(200);
      ownerLockToken = (acquire.body?.lock as { token?: string | null } | undefined)?.token ?? null;
      const baseLogId =
        (acquire.body as { latestActionLogId?: string | null } | null)?.latestActionLogId ?? null;
      expect(ownerLockToken).toBeTruthy();
      expect(baseLogId).toBeTruthy();

      const incomingTitle = `QA TC-LOCK-004 Incoming ${Date.now()}`;
      const incomingUpdate = await updateTodo(request, adminToken, todoId, incomingTitle);
      expect(incomingUpdate.status).toBe(200);

      const conflictAttempt = await updateTodo(
        request,
        superadminToken,
        todoId,
        `QA TC-LOCK-004 Mine ${Date.now()}`,
        {
          token: ownerLockToken,
          baseLogId,
          resolution: 'normal',
        },
        superadminScopeHeaders,
      );
      expect(conflictAttempt.status).toBe(409);
      expect(conflictAttempt.body?.code).toBe('record_lock_conflict');

      const conflictId =
        (conflictAttempt.body?.conflict as { id?: string } | undefined)?.id ?? null;
      expect(conflictId).toBeTruthy();

      await waitForNotification(
        request,
        superadminToken,
        'record_locks.conflict.detected',
        (item) => item.sourceEntityId === conflictId,
      );

      const mergedTitle = `QA TC-LOCK-004 Merged ${Date.now()}`;
      const mergedAttempt = await updateTodo(
        request,
        superadminToken,
        todoId,
        mergedTitle,
        {
          token: ownerLockToken,
          baseLogId,
          resolution: 'merged',
          conflictId,
        },
        superadminScopeHeaders,
      );
      expect(mergedAttempt.status).toBe(200);

      ownerLockToken = null;

      const finalTitle = await getTodoTitle(request, adminToken, todoId);
      expect(finalTitle).toBe(mergedTitle);

      const resolvedNotification = await waitForNotification(
        request,
        adminToken,
        'record_locks.conflict.resolved',
        (item) => item.sourceEntityId === conflictId,
      );
      expect(resolvedNotification.bodyVariables?.resolution).toBe('merged');
    } finally {
      if (ownerLockToken && todoId) {
        await releaseRecordLock(
          request,
          superadminToken,
          LOCK_RESOURCE_KIND,
          todoId,
          ownerLockToken,
          'cancelled',
          undefined,
          superadminScopeHeaders,
        ).catch(() => {});
      }
      await cleanupTodo(request, adminToken, todoId);
      if (previousSettings) {
        await saveRecordLockSettings(request, superadminToken, previousSettings).catch(() => {});
      }
    }
  });
});
