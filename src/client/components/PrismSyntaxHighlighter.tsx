import { Highlight, type Token, type RenderProps } from 'prism-react-renderer';
import React, { useCallback } from 'react';

import { useHighlightedCode } from '../hooks/useHighlightedCode';
import { getPrismLanguageFromFilename } from '../utils/languageDetection';
import Prism from '../utils/prism';
import { getSyntaxTheme } from '../utils/syntaxThemes';

import type { AppearanceSettings } from './SettingsModal';

export interface PrismSyntaxHighlighterProps {
  code: string;
  language?: string;
  className?: string;
  syntaxTheme?: AppearanceSettings['syntaxTheme'];
  filename?: string;
  /**
   * Pre-computed tokens for a single line. When provided, these tokens are
   * rendered instead of tokenizing `code` per line. Used for file-level
   * highlighting of markup-based languages (e.g. Vue SFC) where each line
   * needs context from the surrounding `<script>` / `<style>` tags.
   */
  precomputedTokens?: Token[] | null;
  renderToken?: (
    token: Token,
    key: number,
    getTokenProps: (options: { token: Token }) => Record<string, unknown>,
  ) => React.ReactNode;
  onMouseOver?: (e: React.MouseEvent) => void;
  onMouseOut?: (e: React.MouseEvent) => void;
}

export const PrismSyntaxHighlighter = React.memo(function PrismSyntaxHighlighter({
  code,
  language,
  className,
  syntaxTheme = 'vsDark',
  filename = '',
  precomputedTokens,
  renderToken,
  onMouseOver,
  onMouseOut,
}: PrismSyntaxHighlighterProps) {
  const detectedLang = language || (filename ? getPrismLanguageFromFilename(filename) : 'text');
  const { actualLang } = useHighlightedCode(code, detectedLang);
  const theme = getSyntaxTheme(syntaxTheme);
  const hasPrecomputed = !!precomputedTokens;

  const renderHighlight = useCallback(
    ({ style, tokens, getLineProps, getTokenProps }: RenderProps) => {
      const lineTokens = precomputedTokens ?? tokens[0] ?? [];
      return (
        <span
          className={className}
          style={{ ...style, background: 'transparent', backgroundColor: 'transparent' }}
          onMouseOver={onMouseOver}
          onMouseOut={onMouseOut}
        >
          <span {...getLineProps({ line: lineTokens })}>
            {lineTokens.map((token, key) =>
              renderToken ? (
                renderToken(token, key, getTokenProps)
              ) : (
                <span key={key} {...getTokenProps({ token })} />
              ),
            )}
          </span>
        </span>
      );
    },
    [className, onMouseOver, onMouseOut, renderToken, precomputedTokens],
  );

  // When precomputed tokens are provided we don't need Prism to tokenize the
  // line content — pass an empty string to make the internal `useTokenize`
  // call a no-op while still letting Highlight provide the theme helpers.
  const codeForHighlight = hasPrecomputed ? '' : code;

  return (
    <Highlight code={codeForHighlight} language={actualLang} theme={theme} prism={Prism}>
      {renderHighlight}
    </Highlight>
  );
});
