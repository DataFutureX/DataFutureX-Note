import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { canWriteSync, defaultLibraryDir, probeWritePaths } from '../electron/main/utils/writableFs'

describe('writableFs', () => {
  it('detects writable temp directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfx-w-'))
    expect(canWriteSync(dir)).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('builds default library under userData', () => {
    expect(defaultLibraryDir('C:\\app\\data')).toMatch(/library$/)
  })

  it('probeWritePaths reports status', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfx-p-'))
    const results = probeWritePaths([dir, path.join(dir, 'missing-child-will-be-created')])
    expect(results.every((r) => r.writable)).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
