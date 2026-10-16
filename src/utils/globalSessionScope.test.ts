import { describe, expect, it } from 'vitest'
import {
  directoryForSessionOpen,
  globalScopeDirectory,
  sessionListDirectory,
  sessionMatchesListScope,
} from './globalSessionScope'

describe('globalSessionScope', () => {
  it('treats the server default directory as the global scope', () => {
    expect(globalScopeDirectory({ directory: '/home/user/' })).toBe('/home/user')
    expect(globalScopeDirectory({ directory: 'C:\\Users\\me\\' })).toBe('C:/Users/me')
    expect(globalScopeDirectory({ directory: '' })).toBeUndefined()
    expect(globalScopeDirectory(null)).toBeUndefined()
  })

  it('lists the home directory when no project is selected', () => {
    expect(sessionListDirectory(undefined, { directory: '/home/user' })).toBe('/home/user')
    expect(sessionListDirectory('/workspace/demo', { directory: '/home/user' })).toBe('/workspace/demo')
    expect(sessionListDirectory(undefined, null)).toBeUndefined()
  })

  it('keeps a home-directory session inside Global and still follows other projects', () => {
    expect(directoryForSessionOpen(undefined, '/home/user', '/home/user')).toBeUndefined()
    expect(directoryForSessionOpen(undefined, 'C:\\Users\\me', 'c:/users/me')).toBeUndefined()
    expect(directoryForSessionOpen(undefined, '/workspace/demo', '/home/user')).toBe('/workspace/demo')
    expect(directoryForSessionOpen('/workspace/demo', '/workspace/other', '/home/user')).toBe('/workspace/other')
    expect(directoryForSessionOpen(undefined, '/home/user', undefined)).toBe('/home/user')
  })

  it('matches only sessions in the active list scope', () => {
    expect(sessionMatchesListScope('/home/user', undefined, { directory: '/home/user' })).toBe(true)
    expect(sessionMatchesListScope('/workspace/demo', undefined, { directory: '/home/user' })).toBe(false)
    expect(sessionMatchesListScope('/workspace/demo', '/workspace/demo', { directory: '/home/user' })).toBe(true)
    expect(sessionMatchesListScope('/home/user', undefined, null)).toBe(false)
  })
})
