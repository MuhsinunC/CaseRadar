import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './mocks/server';

// Mock ResizeObserver for Radix UI components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Establish API mocking before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset any request handlers that are declared as a part of tests
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

// Clean up after the tests are finished
afterAll(() => server.close());
