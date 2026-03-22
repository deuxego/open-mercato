import { expect, test } from '@playwright/test';
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth';
import { apiRequest, getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api';
import {
  cleanupTodo,
  createTodoFixture,
  getRecordLockSettings,
  listNotificationsByType,
  saveRecordLockSettings,
  LOCK_RESOURCE_KIND,
  type RecordLockSettings,
} from './helpers/recordLocks';

/**
 * TC-LOCK-008: Reactive contention handling without legacy notification polling
 */
test.describe('TC-LOCK-008: Reactive contention handling without legacy notification polling', () => {
  test.describe.configure({ timeout: 120_000 });

  test('shows record-deleted conflict dialog via notification handler and does not call legacy type-filtered poll', async ({ page, request }) => {
    const superadminToken = await getAuthToken(request, 'superadmin');
    const adminToken = await getAuthToken(request, 'admin');

    let previousSettings: RecordLockSettings | null = null;
    let todoId: string | null = null;
    const legacyPollRequests: string[] = [];

    const onRequest = (rawRequest: { url: () => string }) => {
      const url = rawRequest.url();
      const isLegacyDeletedPoll = (
        url.includes('/api/notifications?')
        && url.includes('status=unread')
        && url.includes('type=record_locks.record.deleted')
      );
      if (isLegacyDeletedPoll) {
        legacyPollRequests.push(url);
      }
    };

    try {
      previousSettings = await getRecordLockSettings(request, superadminToken);
      await saveRecordLockSettings(request, superadminToken, {
        ...previousSettings,
        enabled: true,
        strategy: 'optimistic',
        enabledResources: [LOCK_RESOURCE_KIND],
      });

      todoId = await createTodoFixture(request, adminToken, `QA TC-LOCK-008 Todo ${Date.now()}`);

      await login(page, 'admin');
      page.on('request', onRequest);
      const acquireResponsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/record_locks/acquire') && response.request().method() === 'POST',
        { timeout: 30_000 },
      );
      await page.goto(`/backend/example/todos/${encodeURIComponent(todoId)}/edit`);
      await page.waitForLoadState('domcontentloaded');
      const acquireResponse = await acquireResponsePromise;
      expect(acquireResponse.ok()).toBeTruthy();

      await page.evaluate(() => {
        const eventName = 'om:record_locks:record-deleted';
        const store = window as unknown as { __tcLockDeletedEventCount?: number; __tcLockDeletedListenerInstalled?: boolean };
        if (!store.__tcLockDeletedListenerInstalled) {
          store.__tcLockDeletedEventCount = 0;
          window.addEventListener(eventName, () => {
            store.__tcLockDeletedEventCount = (store.__tcLockDeletedEventCount ?? 0) + 1;
          });
          store.__tcLockDeletedListenerInstalled = true;
        }
      });

      const createNotificationResponse = await apiRequest(request, 'POST', '/api/notifications/feature', {
        token: superadminToken,
        data: {
          requiredFeature: 'record_locks.view',
          type: 'record_locks.record.deleted',
          title: 'Record was deleted',
          body: 'Integration test event',
          severity: 'warning',
          sourceModule: 'record_locks',
          sourceEntityType: 'record_locks:record',
          sourceEntityId: todoId,
          bodyVariables: { resourceKind: LOCK_RESOURCE_KIND },
        },
      });
      expect(createNotificationResponse.ok()).toBeTruthy();

      const delivered = await listNotificationsByType(
        request,
        adminToken,
        'record_locks.record.deleted',
      );
      expect(delivered.some((item) => item.sourceEntityId === todoId)).toBe(true);

      await expect.poll(async () => {
        return page.evaluate(() => {
          const store = window as unknown as { __tcLockDeletedEventCount?: number };
          return store.__tcLockDeletedEventCount ?? 0;
        });
      }, { timeout: 20_000 }).toBeGreaterThan(0);
      expect(legacyPollRequests).toHaveLength(0);
    } finally {
      page.off('request', onRequest);
      await cleanupTodo(request, adminToken, todoId);
      if (previousSettings) {
        await saveRecordLockSettings(request, superadminToken, previousSettings).catch(() => {});
      }
    }
  });
});
