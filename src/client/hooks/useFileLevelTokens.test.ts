import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffFile } from '../../types/diff';

import { useFileLevelTokens } from './useFileLevelTokens';

const VUE_FILE_V1 = `<template>
  <div class="greeting">{{ message }}</div>
</template>

<script setup>
import { ref } from 'vue';
const message = ref('hello');
</script>

<style scoped>
.greeting {
  color: rebeccapurple;
}
</style>
`;

const VUE_FILE_V2 = `<template>
  <div class="greeting">{{ message }}</div>
</template>

<script setup>
import { ref } from 'vue';
const message = ref('updated');
</script>

<style scoped>
.greeting {
  color: tomato;
}
</style>
`;

function createVueFile(): DiffFile {
  return {
    path: 'src/Sample.vue',
    status: 'modified',
    additions: 1,
    deletions: 1,
    chunks: [],
  };
}

function createTsFile(): DiffFile {
  return {
    path: 'src/sample.ts',
    status: 'modified',
    additions: 1,
    deletions: 1,
    chunks: [],
  };
}

function mockBlobFetch(payload: Record<string, string>) {
  vi.mocked(global.fetch).mockImplementation((input: string | URL | Request) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, 'http://localhost');
    const ref = url.searchParams.get('ref') ?? '';
    const body = payload[ref];
    if (body == null) {
      return Promise.resolve({ ok: false, text: async () => '' } as Response);
    }
    return Promise.resolve({ ok: true, text: async () => body } as Response);
  });
}

describe('useFileLevelTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Vue SFCの<script>ブロック内をJavaScriptとしてトークン化する', async () => {
    mockBlobFetch({ HEAD: VUE_FILE_V1, '.': VUE_FILE_V1 });

    const { result } = renderHook(() =>
      useFileLevelTokens({
        file: createVueFile(),
        baseCommitish: 'HEAD',
        targetCommitish: '.',
      }),
    );

    await waitFor(() => {
      expect(result.current.getNewTokens).not.toBeNull();
    });

    // L7: `const message = ref('hello');` should be tokenized as JS, not plain markup.
    const tokensL7 = result.current.getNewTokens?.(7) ?? [];
    expect(tokensL7.length).toBeGreaterThan(0);
    expect(tokensL7.some((t) => t.types.includes('keyword') && t.content === 'const')).toBe(true);
    expect(tokensL7.some((t) => t.types.includes('function') && t.content === 'ref')).toBe(true);
  });

  it('Vue SFCの<style>ブロック内をCSSとしてトークン化する', async () => {
    mockBlobFetch({ HEAD: VUE_FILE_V1, '.': VUE_FILE_V1 });

    const { result } = renderHook(() =>
      useFileLevelTokens({
        file: createVueFile(),
        baseCommitish: 'HEAD',
        targetCommitish: '.',
      }),
    );

    await waitFor(() => {
      expect(result.current.getNewTokens).not.toBeNull();
    });

    // L12: `  color: rebeccapurple;` should be tokenized as CSS property/value.
    const tokensL12 = result.current.getNewTokens?.(12) ?? [];
    expect(tokensL12.some((t) => t.types.includes('property') && t.content === 'color')).toBe(true);
  });

  it('Vue以外のファイル(.ts)ではfetchせずgetterはnullのまま', async () => {
    const { result } = renderHook(() =>
      useFileLevelTokens({
        file: createTsFile(),
        baseCommitish: 'HEAD',
        targetCommitish: '.',
      }),
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.getOldTokens).toBeNull();
    expect(result.current.getNewTokens).toBeNull();
  });

  it('reloadKeyが変わるとblobを再フェッチして最新内容でトークン化する', async () => {
    const responses: Record<string, string> = { HEAD: VUE_FILE_V1, '.': VUE_FILE_V1 };
    mockBlobFetch(responses);

    const { result, rerender } = renderHook(
      ({ reloadKey }) =>
        useFileLevelTokens({
          file: createVueFile(),
          baseCommitish: 'HEAD',
          targetCommitish: '.',
          reloadKey,
        }),
      { initialProps: { reloadKey: 1 } },
    );

    await waitFor(() => {
      const tokens = result.current.getNewTokens?.(7) ?? [];
      expect(tokens.some((t) => t.types.includes('string') && t.content === "'hello'")).toBe(true);
    });

    const fetchCallsAfterFirstLoad = vi.mocked(global.fetch).mock.calls.length;

    // Simulate file watch: blob endpoint now returns updated content.
    responses['.'] = VUE_FILE_V2;
    responses['HEAD'] = VUE_FILE_V2;

    rerender({ reloadKey: 2 });

    await waitFor(() => {
      const tokens = result.current.getNewTokens?.(7) ?? [];
      expect(tokens.some((t) => t.types.includes('string') && t.content === "'updated'")).toBe(
        true,
      );
    });

    expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(fetchCallsAfterFirstLoad);
  });

  it('追加ファイルでは新側のみフェッチし、削除ファイルでは旧側のみフェッチする', async () => {
    mockBlobFetch({ HEAD: VUE_FILE_V1, '.': VUE_FILE_V1 });

    const { result: addedResult } = renderHook(() =>
      useFileLevelTokens({
        file: { ...createVueFile(), status: 'added' },
        baseCommitish: 'HEAD',
        targetCommitish: '.',
      }),
    );

    await waitFor(() => {
      expect(addedResult.current.getNewTokens).not.toBeNull();
    });
    expect(addedResult.current.getOldTokens).toBeNull();

    vi.clearAllMocks();
    mockBlobFetch({ HEAD: VUE_FILE_V1, '.': VUE_FILE_V1 });

    const { result: deletedResult } = renderHook(() =>
      useFileLevelTokens({
        file: { ...createVueFile(), status: 'deleted' },
        baseCommitish: 'HEAD',
        targetCommitish: '.',
      }),
    );

    await waitFor(() => {
      expect(deletedResult.current.getOldTokens).not.toBeNull();
    });
    expect(deletedResult.current.getNewTokens).toBeNull();
  });
});
