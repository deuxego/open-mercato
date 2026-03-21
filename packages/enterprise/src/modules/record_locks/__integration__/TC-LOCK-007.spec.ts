import { expect, test, type APIRequestContext } from '@playwright/test';
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api';
import {
  acquireRecordLock,
  buildScopeCookieFromToken,
  cleanupTodo,
  createTodoFixture,
  getTodoTitle,
  getRecordLockSettings,
  releaseRecordLock,
  saveRecordLockSettings,
  updateTodo,
  waitForNotification,
  LOCK_RESOURCE_KIND,
  type RecordLockSettings,
  type NotificationItem,
} from './helpers/recordLocks';

type ConflictContext = {
  conflictId: string;
  notification: NotificationItem;
  ownerLockToken: string;
  baseLogId: string;
  incomingTitle: string;
};

async function createConflictScenario(
  request: APIRequestContext,
  superadminToken: string,
  adminToken: string,
  todoId: string,
  superadminScopeHeaders?: Record<string, string>,
): Promise<ConflictContext> {
  const acquire = await acquireRecordLock(
    request,
    superadminToken,
    LOCK_RESOURCE_KIND,
    todoId,
    superadminScopeHeaders,
  );
  expect(acquire.status).toBe(200);

  const ownerLockToken = (acquire.body?.lock as { token?: string | null } | undefined)?.token ?? null;
  const baseLogId =
    (acquire.body as { latestActionLogId?: string | null } | null)?.latestActionLogId ?? null;
  expect(ownerLockToken).toBeTruthy();
  expect(baseLogId).toBeTruthy();

  const incomingTitle = `QA TC-LOCK-007 Incoming ${Date.now()}`;
  const incomingUpdate = await updateTodo(request, adminToken, todoId, incomingTitle);
  expect(incomingUpdate.status).toBe(200);

  const conflictAttempt = await updateTodo(
    request,
    superadminToken,
    todoId,
    `QA TC-LOCK-007 Mine ${Date.now()}`,
    {
      token: ownerLockToken,
      baseLogId,
      resolution: 'normal',
    },
    superadminScopeHeaders,
  );
  expect(conflictAttempt.status).toBe(409);
  expect(conflictAttempt.body?.code).toBe('record_lock_conflict');

  const conflictId = (conflictAttempt.body?.conflict as { id?: string } | undefined)?.id ?? null;
  expect(conflictId).toBeTruthy();

  const notification = await waitForNotification(
    request,
    superadminToken,
    'record_locks.conflict.detected',
    (item) => item.sourceEntityId === conflictId,
  );

  return {
    conflictId: conflictId as string,
    notification,
    ownerLockToken: ownerLockToken as string,
    baseLogId: baseLogId as string,
    incomingTitle,
  };
}

/**
 * TC-LOCK-007: Conflict notification changed fields and apply/reject actions
 */
test.describe('TC-LOCK-007: Conflict notification changed fields and apply/reject actions', () => {
  test.describe.configure({ timeout: 90_000 });

  test('should include changed incoming fields and execute accept_incoming action from notification', async ({ request }) => {
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

      todoId = await createTodoFixture(request, adminToken, `QA TC-LOCK-007 Todo A ${Date.now()}`);

      const conflict = await createConflictScenario(
        request,
        superadminToken,
        adminToken,
        todoId,
        superadminScopeHeaders,
      );
      ownerLockToken = conflict.ownerLockToken;

      expect(conflict.notification.bodyVariables?.changedFields?.toLowerCase()).toContain('title');
      const actionIds = (conflict.notification.actions ?? []).map((item) => item.id);
      expect(actionIds).toEqual([]);

      const releaseResult = await releaseRecordLock(
        request,
        superadminToken,
        LOCK_RESOURCE_KIND,
        todoId,
        conflict.ownerLockToken,
        'conflict_resolved',
        {
          conflictId: conflict.conflictId,
          resolution: 'accept_incoming',
        },
        superadminScopeHeaders,
      );
      expect(releaseResult.status).toBe(200);
      expect(releaseResult.body?.ok).toBe(true);
      expect((releaseResult.body as { conflictResolved?: boolean } | null)?.conflictResolved).toBe(true);

      const finalTitle = await getTodoTitle(request, adminToken, todoId);
      expect(finalTitle).toBe(conflict.incomingTitle);

      await waitForNotification(
        request,
        adminToken,
        'record_locks.conflict.resolved',
        (item) => item.sourceEntityId === conflict.conflictId && item.bodyVariables?.resolution === 'accept_incoming',
      );
      ownerLockToken = null;
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

  test('should execute accept_mine action from notification and emit resolved notification', async ({ request }) => {
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

      todoId = await createTodoFixture(request, adminToken, `QA TC-LOCK-007 Todo B ${Date.now()}`);

      const conflict = await createConflictScenario(
        request,
        superadminToken,
        adminToken,
        todoId,
        superadminScopeHeaders,
      );
      ownerLockToken = conflict.ownerLockToken;
      const keepMineTitle = `QA TC-LOCK-007 Keep Mine ${Date.now()}`;

      const updateResult = await updateTodo(
        request,
        superadminToken,
        todoId,
        keepMineTitle,
        {
          token: conflict.ownerLockToken,
          baseLogId: conflict.baseLogId,
          resolution: 'accept_mine',
          conflictId: conflict.conflictId,
        },
        superadminScopeHeaders,
      );
      expect(updateResult.status).toBe(200);
      expect(updateResult.body?.ok).toBe(true);

      const finalTitle = await getTodoTitle(request, adminToken, todoId);
      expect(finalTitle).toBe(keepMineTitle);

      await waitForNotification(
        request,
        adminToken,
        'record_locks.conflict.resolved',
        (item) => item.sourceEntityId === conflict.conflictId && item.bodyVariables?.resolution === 'accept_mine',
      );
      ownerLockToken = null;
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
