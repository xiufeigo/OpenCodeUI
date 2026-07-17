/**
 * 液态玻璃位移图生成器
 *
 * 基于圆角矩形 SDF 生成 feDisplacementMap 用的位移场：
 * - 中心平坦区：采样原坐标，无变形（折射仅限边缘）
 * - 边缘带：采样坐标向中心压缩，背景在边缘处呈现透镜「膨胀」感
 *
 * 算法参考 shuding/liquid-glass，按 uv 空间参数化以适配任意元素尺寸。
 * 常量均为视觉调优旋钮。
 */

/** 生成分辨率缩放（平滑渐变，低分辨率生成后放大无损） */
export const DISPLACEMENT_DPI_SCALE = 0.25
/** 边缘折射带宽（uv 比例，0.12 ≈ 元素短边方向外侧 12%） */
export const EDGE_BAND = 0.12
/** SDF 距离偏移：平坦区在 EDGE_BAND 之外再延伸的距离（uv 比例） */
export const SDF_SHIFT = 0.05
/** 折射强度放大系数（feDisplacementMap scale 的倍率） */
export const REFRACTION_STRENGTH = 2

export interface DisplacementMap {
  /** RGBA 通道：R=dx、G=dy（0.5 为零点的归一化），B=0、A=255 */
  data: Uint8ClampedArray
  /** 生成分辨率宽（已乘 DISPLACEMENT_DPI_SCALE） */
  width: number
  /** 生成分辨率高 */
  height: number
  /** feDisplacementMap 的 scale（元素像素单位） */
  scale: number
}

function smoothStep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

/** 圆角矩形有向距离（内部为负，边界为 0，外部为正），x/y 以矩形中心为原点 */
function roundedRectSDF(x: number, y: number, halfW: number, halfH: number, radius: number): number {
  const qx = Math.abs(x) - halfW + radius
  const qy = Math.abs(y) - halfH + radius
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius
}

export function generateDisplacementMap(width: number, height: number, radius: number): DisplacementMap {
  const w = Math.max(1, Math.round(width * DISPLACEMENT_DPI_SCALE))
  const h = Math.max(1, Math.round(height * DISPLACEMENT_DPI_SCALE))
  const data = new Uint8ClampedArray(w * h * 4)

  // 平坦中心区：uv 空间内缩 EDGE_BAND 的圆角矩形
  const halfW = 0.5 - EDGE_BAND
  const halfH = 0.5 - EDGE_BAND
  const r = Math.min(Math.max(radius / Math.min(width, height), 0.01), Math.min(halfW, halfH))

  const raw: number[] = []
  let maxScale = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 像素中心采样：保证边缘像素左右/上下对称
      const ix = (x + 0.5) / w - 0.5
      const iy = (y + 0.5) / h - 0.5
      const distanceToEdge = roundedRectSDF(ix, iy, halfW, halfH, r)
      // 中心（distance ≤ 0）→ displacement=1 → scaled=1 → 采样原 uv（无变形）
      // 边缘 → displacement→0 → 采样坐标向中心压缩（透镜膨胀）
      const displacement = smoothStep(EDGE_BAND, 0, distanceToEdge - SDF_SHIFT)
      const scaled = smoothStep(0, 1, displacement)
      const sampleX = ix * scaled + 0.5
      const sampleY = iy * scaled + 0.5
      const dx = sampleX * w - (x + 0.5)
      const dy = sampleY * h - (y + 0.5)
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy))
      raw.push(dx, dy)
    }
  }

  const safeMax = maxScale || 1
  let p = 0
  for (let i = 0; i < raw.length; i += 2) {
    data[p++] = (raw[i] / safeMax + 0.5) * 255
    data[p++] = (raw[i + 1] / safeMax + 0.5) * 255
    data[p++] = 0
    data[p++] = 255
  }

  return {
    data,
    width: w,
    height: h,
    scale: (safeMax / DISPLACEMENT_DPI_SCALE) * REFRACTION_STRENGTH,
  }
}
