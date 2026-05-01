import katex from 'katex'

interface MathContentProps {
  text?: string | null
  className?: string
}

type Segment =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string; displayMode: boolean }

const MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(MATH_PATTERN)) {
    const token = match[0]
    const index = match.index ?? 0

    if (index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, index) })
    }

    const displayMode = token.startsWith('$$')
    segments.push({
      type: 'math',
      value: token.slice(displayMode ? 2 : 1, displayMode ? -2 : -1).trim(),
      displayMode,
    })
    lastIndex = index + token.length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}

export default function MathContent({ text, className }: MathContentProps) {
  if (!text) return null

  const segments = parseSegments(text)

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <span key={`${segment.type}-${index}`} className="math-text-segment">
              {segment.value}
            </span>
          )
        }

        try {
          const html = katex.renderToString(segment.value, {
            throwOnError: false,
            displayMode: segment.displayMode,
            strict: 'ignore',
          })

          return (
            <span
              key={`${segment.type}-${index}`}
              className={segment.displayMode ? 'math-block-segment' : 'math-inline-segment'}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        } catch {
          return (
            <span key={`${segment.type}-${index}`} className="math-fallback-segment">
              {segment.displayMode ? `$$${segment.value}$$` : `$${segment.value}$`}
            </span>
          )
        }
      })}
    </span>
  )
}
