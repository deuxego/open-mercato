import { expect, test } from '@playwright/test';
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api';
import {
  acquireRecordLock,
  cleanupTodo,
  createTodoFixture,
  getRecordLockSettings,
  releaseRecordLock,
  saveRecordLockSettings,
  updateTodo,
  LOCK_RESOURCE_KIND,
  type RecordLockSettings,
} from './helpers/recordLocks';

/**
 * TC-LOCK-001: Pessimistic lock blocks a second editor
 */
test.describe('TC-LOCK-001: Pessimistic lock blocks a second editor', () => {
  test.describe.configure({ timeout: 90_000 });

  test('should return 423 for secondary editor update while lock is active', async ({ request }) => {
    const superadminToken = await getAuthToken(request, 'superadmin');
    const adminToken = await getAuthToken(request, 'admin');

    let previousSettings: RecordLockSettings | null = null;
    let todoId: string | null = null;
    let ownerLockToken: string | null = null;

    try {
      previousSettings = await getRecordLockSettings(request, superadminToken);
      await saveRecordLockSettings(request, superadminToken, {
        ...previousSettings,
        enabled: true,
        strategy: 'pessimistic',
        enabledResources: [LOCK_RESOURCE_KIND],
      });

      todoId = await createTodoFixture(request, adminToken, `QA TC-LOCK-001 Todo ${Date.now()}`);

      const ownerAcquire = await acquireRecordLock(request, superadminToken, LOCK_RESOURCE_KIND, todoId);
      expect(ownerAcquire.status).toBe(200);
      expect(ownerAcquire.body?.ok).toBe(true);
      ownerLockToken =
        (ownerAcquire.body?.lock as { token?: string | null } | undefined)?.token ?? null;
      expect(ownerLockToken).toBeTruthy();

      const blockedUpdate = await updateTodo(
        request,
        adminToken,
        todoId,
        `QA TC-LOCK-001 Blocked Update ${Date.now()}`,
      );
      expect(blockedUpdate.status).toBe(423);
      expect(blockedUpdate.body?.code).toBe('record_locked');

      const ownerRelease = await releaseRecordLock(
        request,
        superadminToken,
        LOCK_RESOURCE_KIND,
        todoId,
        ownerLockToken as string,
      );
      expect(ownerRelease.status).toBe(200);
      expect(ownerRelease.body?.released).toBe(true);
      ownerLockToken = null;

      const updateAfterRelease = await updateTodo(
        request,
        adminToken,
        todoId,
        `QA TC-LOCK-001 Unblocked Update ${Date.now()}`,
      );
      expect(updateAfterRelease.status).toBe(200);
      expect(updateAfterRelease.body?.ok).toBe(true);
    } finally {
      if (ownerLockToken && todoId) {
        await releaseRecordLock(request, superadminToken, LOCK_RESOURCE_KIND, todoId, ownerLockToken).catch(() => {});
      }
      await cleanupTodo(request, adminToken, todoId);
      if (previousSettings) {
        await saveRecordLockSettings(request, superadminToken, previousSettings).catch(() => {});
      }
    }
  });
});
