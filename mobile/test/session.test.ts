import { expect, test } from 'bun:test';
import { setReaderSession, getReaderSession } from '../src/reader/session';

test('getReaderSession: returns the ids stored by the last setReaderSession call for the same key', () => {
  setReaderSession('unread', [1, 2, 3]);
  expect(getReaderSession('unread')).toEqual([1, 2, 3]);
});

test('getReaderSession: returns null when the key does not match the last stored key', () => {
  setReaderSession('unread', [1, 2, 3]);
  expect(getReaderSession('today')).toBeNull();
});
