import type { Entity } from '../../lib/types'

// THE OWNERSHIP BOUNDARY.
// A single full-width band. Everything above is Shift IP; everything below is
// the client’s own instance. The build keeps the line where it is.
export const boundary: Entity[] = [
  {
    id: 'boundary',
    kind: 'boundary',
    owner: 'shift',
    title: 'OWNERSHIP BOUNDARY · the client controls everything below',
    source: 'real',
    about:
      'The line where Shift’s IP ends and the client’s instance begins. Above: the firm’s control plane, brain, and the shared platform. Below: a runnable fork the client controls. A buy-out transfers what is below the line, never what is above it.',
    w: 1320,
    h: 44,
  },
]
