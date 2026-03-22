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
 *
 * Verifies that record_locks.record.deleted notifications are delivered to the
 * browser via SSE event bridge and processed by the reactive notification handler
 * (which dispatches a DOM CustomEvent), rather than through legacy type-filtered
 * notification polling.
 *
 * Note: this test validates the notification handler pipeline, not the lock widget.
 * The handler runs independently of whether the injection widget renders.
 */
test.describe('TC-LOCK-008: Reactive contention handling without legacy notification polling', () => {
  test.describe.configure({ timeout: 120_000 });

  test('delivers record-deleted event via reactive notification handler without legacy polling', async ({ page, request }) => {
    const superadminToken = await getAuthToken(request, 'superadmin');
    const adminToken = await getAuthToken(request, 'admin');

    let previousSettings: RecordLockSettings | null = null;
    let todoId: string | null = null;
    let createdNotificationIds: string[] = [];
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

      // Navigate to the edit page; use domcontentloaded (not networkidle — SSE
      // EventSource keeps a persistent connection that prevents networkidle)
      const editUrl = `/backend/example/todos/${encodeURIComponent(todoId)}/edit`;
      await page.goto(editUrl);
      await page.waitForLoadState('domcontentloaded');

      // Wait for the edit form to be interactive (ensures React hydration + SSE bridge init)
      await page.locator('form').first().waitFor({ state: 'visible', timeout: 30_000 });

      // Install DOM event listener for the reactive notification handler
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

      // Create a record_locks.record.deleted notification targeting the admin user
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

      // Capture notification IDs for cleanup
      try {
        const notificationBody = await createNotificationResponse.json();
        const ids = Array.isArray(notificationBody) ? notificationBody.map((n: { id?: string }) => n.id).filter(Boolean)
          : notificationBody?.id ? [notificationBody.id]
          : [];
        createdNotificationIds = ids as string[];
      } catch { /* response may not be JSON — proceed without cleanup IDs */ }

      // Verify notification was persisted and delivered to the admin
      const delivered = await listNotificationsByType(
        request,
        adminToken,
        'record_locks.record.deleted',
      );
      expect(delivered.some((item) => item.sourceEntityId === todoId)).toBe(true);

      // The reactive notification handler should dispatch a DOM event via the SSE bridge
      await expect.poll(async () => {
        return page.evaluate(() => {
          const store = window as unknown as { __tcLockDeletedEventCount?: number };
          return store.__tcLockDeletedEventCount ?? 0;
        });
      }, { timeout: 30_000 }).toBeGreaterThan(0);

      // No legacy type-filtered polling should have occurred
      expect(legacyPollRequests).toHaveLength(0);
    } finally {
      page.off('request', onRequest);
      for (const notifId of createdNotificationIds) {
        await apiRequest(request, 'PUT', `/api/notifications/${notifId}/dismiss`, {
          token: adminToken,
        }).catch(() => {});
      }
      await cleanupTodo(request, adminToken, todoId);
      if (previousSettings) {
        await saveRecordLockSettings(request, superadminToken, previousSettings).catch(() => {});
      }
    }
  });
});
