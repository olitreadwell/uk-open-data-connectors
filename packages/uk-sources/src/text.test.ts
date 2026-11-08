import { describe, expect, it } from 'vitest';

import { decodeMarkupEntities, stripMarkup } from './text.js';

describe('decodeMarkupEntities', () => {
  it('decodes named, decimal, and hexadecimal entities', () => {
    expect(decodeMarkupEntities('Fish &amp; chips &lt;3 &#163;5 &#x2014; now')).toBe(
      'Fish & chips <3 £5 — now'
    );
  });

  it('leaves text without entities alone', () => {
    expect(decodeMarkupEntities('BGS 1:50k Bedrock')).toBe('BGS 1:50k Bedrock');
  });
});

describe('stripMarkup', () => {
  it('removes tags and collapses the whitespace they leave behind', () => {
    expect(stripMarkup('<p>Parish to <b>ward</b> lookup</p>\n<p>Second line</p>')).toBe(
      'Parish to ward lookup Second line'
    );
  });

  it('decodes entities after removing tags', () => {
    expect(stripMarkup('<span>Fish &amp; chips</span>')).toBe('Fish & chips');
  });
});
