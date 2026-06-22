import { describe, it, expect } from 'vitest';

function helloWorld(): string {
  return 'Hello World';
}

describe('Hello World', () => {
  it('should return "Hello World"', () => {
    expect(helloWorld()).toBe('Hello World');
  });

  it('should be a string', () => {
    expect(typeof helloWorld()).toBe('string');
  });

  it('should contain "Hello"', () => {
    expect(helloWorld()).toContain('Hello');
  });

  it('should contain "World"', () => {
    expect(helloWorld()).toContain('World');
  });
});
