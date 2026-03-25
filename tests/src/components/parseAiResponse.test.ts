import { describe, it, expect } from 'vitest'
import { parseAiResponse, stripCodeFences } from '../../../src/panels/AiPanel'

describe('parseAiResponse - additional cases', () => {
  it('parses response with REVISED section only', () => {
    const text = `=== REVISED ===
only the revised text here`
    const parsed = parseAiResponse(text)
    expect(parsed.revised).toBe('only the revised text here')
    expect(parsed.comments).toBe('')
    expect(parsed.suggestions).toBe('')
    expect(parsed.raw).toBe(text)
  })

  it('parses response with all 3 sections', () => {
    const text = `=== REVISED ===
The improved introduction.

=== COMMENTS ===
- Improved clarity
- Fixed grammar

=== SUGGESTIONS ===
- Consider adding a citation`
    const parsed = parseAiResponse(text)
    expect(parsed.revised).toBe('The improved introduction.')
    expect(parsed.comments).toContain('Improved clarity')
    expect(parsed.comments).toContain('Fixed grammar')
    expect(parsed.suggestions).toContain('Consider adding a citation')
  })

  it('returns empty revised and raw text for malformed response with no sections', () => {
    const text = 'This is just a plain response with no sections at all.'
    const parsed = parseAiResponse(text)
    expect(parsed.revised).toBe('')
    expect(parsed.raw).toBe(text)
    expect(parsed.comments).toBe('')
    expect(parsed.suggestions).toBe('')
  })

  it('handles sections with extra surrounding whitespace', () => {
    const text = `

=== REVISED ===

   text with whitespace around it

=== COMMENTS ===

   some comment

`
    const parsed = parseAiResponse(text)
    // trim() is applied by parseAiResponse
    expect(parsed.revised).toBe('text with whitespace around it')
    expect(parsed.comments).toBe('some comment')
  })

  it('handles sections where REVISED content contains code fences', () => {
    const text = `=== REVISED ===
\`\`\`latex
\\section{Introduction}
This is the introduction.
\`\`\`

=== COMMENTS ===
Wrapped in latex code fence.`
    const parsed = parseAiResponse(text)
    // stripCodeFences should remove the latex fence from revised
    expect(parsed.revised).toContain('\\section{Introduction}')
    expect(parsed.revised).not.toContain('```latex')
    expect(parsed.revised).not.toContain('```')
    expect(parsed.comments).toContain('Wrapped in latex code fence.')
  })

  it('handles empty REVISED section gracefully', () => {
    const text = `=== REVISED ===

=== COMMENTS ===
Some comment`
    const parsed = parseAiResponse(text)
    // Empty revised means no structured parse — falls back to raw
    // (because !sections['revised'] is true when content is empty)
    expect(parsed.raw).toBeDefined()
  })

  it('section headers are case-sensitive — lowercase does not trigger parsing', () => {
    const text = `=== revised ===
this should not be parsed as revised section`
    const parsed = parseAiResponse(text)
    expect(parsed.revised).toBe('')
    expect(parsed.raw).toBe(text)
  })

  it('does not include === markers in parsed content', () => {
    const text = `=== REVISED ===
clean text

=== COMMENTS ===
clean comment`
    const parsed = parseAiResponse(text)
    expect(parsed.revised).not.toMatch(/={3}/)
    expect(parsed.comments).not.toMatch(/={3}/)
  })
})

describe('stripCodeFences - additional cases', () => {
  it('strips ```tex wrapper', () => {
    const text = '```tex\n\\section{Hello}\n```'
    expect(stripCodeFences(text)).toBe('\\section{Hello}')
  })

  it('strips multiline latex code fences', () => {
    const text = '```latex\nline one\nline two\n```'
    expect(stripCodeFences(text)).toBe('line one\nline two')
  })

  it('returns text unchanged when fences are not at boundaries', () => {
    const text = 'Some text ```not a fence``` here'
    expect(stripCodeFences(text)).toBe('Some text ```not a fence``` here')
  })
})
