import { expect, test } from '@playwright/test';
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api';
import {
  acquireRecordLock,
  cleanupTodo,
  createTodoFixture,
  forceReleaseRecordLock,
  getRecordLockSettings,
  listNotificationsByType,
  saveRecordLockSettings,
  updateTodo,
  waitForNotification,
  LOCK_RESOURCE_KIND,
  type RecordLockSettings,
} from './helpers/recordLocks';

/**
 * TC-LOCK-005: Pessimistic force release and takeover
 */
test.describe('TC-LOCK-005: Pessimistic force release and takeover', () => {
  test.describe.configure({ timeout: 90_000 });

  test('admin can force release lock and continue mutation flow', async ({ request }) => {
    const superadminToken = await getAuthToken(request, 'superadmin');
    const adminToken = await getAuthToken(request, 'admin');

    let previousSettings: RecordLockSettings | null = null;
    let todoId: string | null = null;

    try {
      previousSettings = await getRecordLockSettings(request, superadminToken);
      await saveRecordLockSettings(request, superadminToken, {
        ...previousSettings,
        enabled: true,
        strategy: 'pessimistic',
        enabledResources: [LOCK_RESOURCE_KIND],
        allowForceUnlock: true,
      });

      todoId = await createTodoFixture(request, adminToken, `QA TC-LOCK-005 Todo ${Date.now()}`);

      const ownerAcquire = await acquireRecordLock(request, superadminToken, LOCK_RESOURCE_KIND, todoId);
      expect(ownerAcquire.status).toBe(200);
      expect(ownerAcquire.body?.ok).toBe(true);
      const ownerLockToken =
        (ownerAcquire.body?.lock as { token?: string | null } | undefined)?.token ?? null;
      expect(ownerLockToken).toBeTruthy();

      const blockedUpdate = await updateTodo(
        request,
        adminToken,
        todoId,
        `QA TC-LOCK-005 Blocked ${Date.now()}`,
      );
      expect(blockedUpdate.status).toBe(423);
      expect(blockedUpdate.body?.code).toBe('record_locked');

      const existingForceReleaseNotifications = await listNotificationsByType(
        request,
        superadminToken,
        'record_locks.lock.force_released',
      );
      const knownNotificationIds = new Set(existingForceReleaseNotifications.map((entry) => entry.id));

      const forceRelease = await forceReleaseRecordLock(
        request,
        adminToken,
        LOCK_RESOURCE_KIND,
        todoId,
        'qa_tc_lock_005_takeover',
      );
      expect(forceRelease.status).toBe(200);
      expect(forceRelease.body?.released).toBe(true);

      const nextLock = (forceRelease.body?.lock as { id?: string; status?: string; lockedByUserId?: string } | undefined) ?? null;
      if (nextLock) {
        expect(nextLock.status).toBe('active');
        expect(nextLock.lockedByUserId).toBeTruthy();
      }

      const forceReleaseNotification = await waitForNotification(
        request,
        superadminToken,
        'record_locks.lock.force_released',
        (item) =>
          !knownNotificationIds.has(item.id),
        30_000,
        500,
      );
      expect(forceReleaseNotification.type).toBe('record_locks.lock.force_released');

      const updateAfterForceRelease = await updateTodo(
        request,
        adminToken,
        todoId,
        `QA TC-LOCK-005 Updated ${Date.now()}`,
      );
      expect(updateAfterForceRelease.status).toBe(200);
      expect(updateAfterForceRelease.body?.ok).toBe(true);
    } finally {
      await cleanupTodo(request, adminToken, todoId);
      if (previousSettings) {
        await saveRecordLockSettings(request, superadminToken, previousSettings).catch(() => {});
      }
    }
  });
});
