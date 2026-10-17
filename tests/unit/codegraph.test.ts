/**
 * Unit tests for the optional CodeGraph integration module (src/codegraph.ts)
 * and the search boost (src/search.ts codegraphBoost).
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractCodeTokens,
  hasCodegraphIndex,
  findCodegraphRoot,
  resetCodegraphResolution,
  resolveCodegraph,
} from '../../src/codegraph.ts'
import { codegraphBoost } from '../../src/search.ts'
import type { IndexEntry } from '../../src/indexing.ts'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('extractCodeTokens', () => {
  it('extracts file names with extensions', () => {
    const tokens = extractCodeTokens('fix the bug in src/auth/session.ts please')
    assert.ok(tokens.includes('src/auth/session.ts'))
  })

  it('extracts camelCase identifiers', () => {
    const tokens = extractCodeTokens('the authenticateUser function calls validateToken')
    assert.ok(tokens.includes('authenticateUser'))
    assert.ok(tokens.includes('validateToken'))
  })

  it('extracts PascalCase identifiers', () => {
    const tokens = extractCodeTokens('AuthService handles the login flow')
    assert.ok(tokens.includes('AuthService'))
  })

  it('extracts snake_case identifiers', () => {
    const tokens = extractCodeTokens('the get_user_profile endpoint is slow')
    assert.ok(tokens.includes('get_user_profile'))
  })

  it('respects the limit parameter', () => {
    const text = 'alpha.ts beta.ts gamma.ts delta.ts epsilon.ts zeta.ts eta.ts'
    const tokens = extractCodeTokens(text, 3)
    assert.ok(tokens.length <= 3)
  })

  it('deduplicates tokens', () => {
    const tokens = extractCodeTokens('AuthService AuthService AuthService')
    const authCount = tokens.filter((t) => t === 'AuthService').length
    assert.equal(authCount, 1)
  })

  it('returns empty array for plain prose', () => {
    const tokens = extractCodeTokens('please fix this typo in the readme')
    assert.deepEqual(tokens, [])
  })
})

describe('hasCodegraphIndex / findCodegraphRoot', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cg-test-'))
  })

  it('returns false when no .codegraph exists', () => {
    try {
      assert.equal(hasCodegraphIndex(tempDir), false)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns true when .codegraph exists at cwd', () => {
    try {
      mkdirSync(join(tempDir, '.codegraph'))
      assert.equal(hasCodegraphIndex(tempDir), true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns true when .codegraph exists in ancestor', () => {
    try {
      mkdirSync(join(tempDir, '.codegraph'))
      const sub = join(tempDir, 'src', 'deep')
      mkdirSync(sub, { recursive: true })
      assert.equal(hasCodegraphIndex(sub), true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('findCodegraphRoot returns the nearest indexed ancestor', () => {
    try {
      mkdirSync(join(tempDir, '.codegraph'))
      const sub = join(tempDir, 'src')
      mkdirSync(sub)
      assert.equal(findCodegraphRoot(sub), tempDir)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('findCodegraphRoot returns undefined when not indexed', () => {
    try {
      assert.equal(findCodegraphRoot(tempDir), undefined)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe('resolveCodegraph', () => {
  beforeEach(() => {
    resetCodegraphResolution()
  })

  it('returns null when subprocess is undefined', async () => {
    const result = await resolveCodegraph(undefined)
    assert.equal(result, null)
  })

  it('caches the result across calls', async () => {
    let callCount = 0
    const stub = {
      resolveExecutable: async (_name: string) => {
        callCount++
        return '/usr/bin/codegraph'
      },
    } as any
    const first = await resolveCodegraph(stub)
    const second = await resolveCodegraph(stub)
    assert.equal(first, '/usr/bin/codegraph')
    assert.equal(second, '/usr/bin/codegraph')
    assert.equal(callCount, 1) // cached after first call
  })

  it('caches null on failure', async () => {
    let callCount = 0
    const stub = {
      resolveExecutable: async (_name: string) => {
        callCount++
        throw new Error('not found')
      },
    } as any
    const first = await resolveCodegraph(stub)
    const second = await resolveCodegraph(stub)
    assert.equal(first, null)
    assert.equal(second, null)
    assert.equal(callCount, 1)
  })
})

describe('codegraphBoost (search scoring)', () => {
  it('returns 0 when entry has no codegraphSymbols', () => {
    const entry: IndexEntry = { path: 'test.md', title: 'Test', topics: [], kind: 'chapter' }
    assert.equal(codegraphBoost(entry, ['auth']), 0)
  })

  it('returns 0 when terms are empty', () => {
    const entry: IndexEntry = {
      path: 'test.md', title: 'Test', topics: [], kind: 'chapter',
      codegraphSymbols: ['authenticate'],
    }
    assert.equal(codegraphBoost(entry, []), 0)
  })

  it('returns bonus when term matches a symbol (substring)', () => {
    const entry: IndexEntry = {
      path: 'test.md', title: 'Test', topics: [], kind: 'chapter',
      codegraphSymbols: ['authenticate', 'validateToken'],
    }
    const score = codegraphBoost(entry, ['auth'])
    assert.ok(score > 0)
    assert.ok(score <= 1.0)
  })

  it('caps total bonus at 1.0', () => {
    const entry: IndexEntry = {
      path: 'test.md', title: 'Test', topics: [], kind: 'chapter',
      codegraphSymbols: ['authMiddleware', 'authenticate', 'authService'],
    }
    // Three terms each matching a different symbol → 3 * 0.5 = 1.5 → capped at 1.0
    const score = codegraphBoost(entry, ['authmiddleware', 'authenticate', 'authservice'], 0.5)
    assert.equal(score, 1.0) // capped
  })

  it('is case-insensitive', () => {
    const entry: IndexEntry = {
      path: 'test.md', title: 'Test', topics: [], kind: 'chapter',
      codegraphSymbols: ['Authenticate'],
    }
    assert.ok(codegraphBoost(entry, ['authenticate']) > 0)
  })

  it('returns 0 when no symbols match', () => {
    const entry: IndexEntry = {
      path: 'test.md', title: 'Test', topics: [], kind: 'chapter',
      codegraphSymbols: ['processPayment'],
    }
    assert.equal(codegraphBoost(entry, ['auth']), 0)
  })
})
