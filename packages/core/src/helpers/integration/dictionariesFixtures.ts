import { expect, type APIRequestContext } from '@playwright/test';
import { apiRequest } from './api';

export async function createDictionaryFixture(
  request: APIRequestContext,
  token: string,
  input: { key: string; name: string },
): Promise<string> {
  const response = await apiRequest(request, 'POST', '/api/dictionaries', {
    token,
    data: { key: input.key, name: input.name },
  });
  expect(response.ok(), `Failed to create dictionary fixture: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { id?: string };
  expect(typeof body.id === 'string' && body.id.length > 0).toBeTruthy();
  return body.id as string;
}

export async function createDictionaryEntryFixture(
  request: APIRequestContext,
  token: string,
  dictionaryId: string,
  input: { value: string; label: string },
): Promise<string> {
  const response = await apiRequest(request, 'POST', `/api/dictionaries/${dictionaryId}/entries`, {
    token,
    data: { value: input.value, label: input.label },
  });
  expect(response.ok(), `Failed to create dictionary entry fixture: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { id?: string };
  expect(typeof body.id === 'string' && body.id.length > 0).toBeTruthy();
  return body.id as string;
}

export async function deleteDictionaryEntryIfExists(
  request: APIRequestContext,
  token: string | null,
  dictionaryId: string | null,
  entryId: string | null,
): Promise<void> {
  if (!token || !dictionaryId || !entryId) return;
  try {
    await apiRequest(request, 'DELETE', `/api/dictionaries/${dictionaryId}/entries/${entryId}`, { token });
  } catch {
    return;
  }
}

export async function deleteDictionaryIfExists(
  request: APIRequestContext,
  token: string | null,
  dictionaryId: string | null,
): Promise<void> {
  if (!token || !dictionaryId) return;
  try {
    await apiRequest(request, 'DELETE', `/api/dictionaries/${dictionaryId}`, { token });
  } catch {
    return;
  }
}
