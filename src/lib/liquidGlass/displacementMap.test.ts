import { describe, expect, it } from 'vitest'
import {
  DISPLACEMENT_DPI_SCALE,
  EDGE_BAND,
  REFRACTION_STRENGTH,
  SDF_SHIFT,
  generateDisplacementMap,
} from './displacementMap'

const W = 400
const H = 200
const RADIUS = 16

/** 从 RGBA 通道还原 map 像素单位的位移（channel = raw/safeMax + 0.5，safeMax = scale * DPI_SCALE） */
function readRaw(map: ReturnType<typeof generateDisplacementMap>, x: number, y: number) {
  const i = (y * map.width + x) * 4
  const safeMax = map.scale * DISPLACEMENT_DPI_SCALE
  return {
    dx: (map.data[i] / 255 - 0.5) * safeMax,
    dy: (map.data[i + 1] / 255 - 0.5) * safeMax,
  }
}

describe('generateDisplacementMap', () => {
  const map = generateDisplacementMap(W, H, RADIUS)
  const mw = map.width
  const mh = map.height

  it('generates a low-resolution map scaled by DPI scale', () => {
    expect(mw).toBe(Math.round(W * DISPLACEMENT_DPI_SCALE))
    expect(mh).toBe(Math.round(H * DISPLACEMENT_DPI_SCALE))
    expect(map.data.length).toBe(mw * mh * 4)
    expect(map.scale).toBeGreaterThan(0)
  })

  it('has zero displacement at the center', () => {
    const c = readRaw(map, Math.floor(mw / 2), Math.floor(mh / 2))
    expect(Math.abs(c.dx)).toBeLessThan(0.5)
    expect(Math.abs(c.dy)).toBeLessThan(0.5)
  })

  it('has zero displacement across the flat center zone', () => {
    // 距中心 20% 宽处仍在平坦区内（折射仅限边缘）
    const p = readRaw(map, Math.floor(mw * 0.7), Math.floor(mh / 2))
    expect(Math.abs(p.dx)).toBeLessThan(0.5)
  })

  it('displaces toward the center at left/right edges, symmetrically', () => {
    const l = readRaw(map, 1, Math.floor(mh / 2))
    const r = readRaw(map, mw - 2, Math.floor(mh / 2))
    expect(l.dx).toBeGreaterThan(0.5)
    expect(r.dx).toBeLessThan(-0.5)
    expect(Math.abs(Math.abs(l.dx) - Math.abs(r.dx))).toBeLessThan(0.5)
  })

  it('displaces toward the center at top/bottom edges', () => {
    const t = readRaw(map, Math.floor(mw / 2), 1)
    const b = readRaw(map, Math.floor(mw / 2), mh - 2)
    expect(t.dy).toBeGreaterThan(0.5)
    expect(b.dy).toBeLessThan(-0.5)
  })
})

describe('refraction tuning constants', () => {
  it('pins the visual tuning knobs', () => {
    expect(REFRACTION_STRENGTH).toBe(4)
    expect(EDGE_BAND).toBe(0.16)
    expect(SDF_SHIFT).toBe(0.08)
  })
})
