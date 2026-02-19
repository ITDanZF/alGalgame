import type { AssetPath } from '../../core/types'

/** 缓存条目 */
interface CacheEntry {
  /** 已加载的 HTMLImageElement */
  image: HTMLImageElement
  /** 最后访问时间戳（用于 LRU 淘汰） */
  lastAccess: number
}

/** 加载进度回调 */
type ProgressCallback = (loaded: number, total: number) => void

/**
 * 图片加载器
 * - 预加载 & 缓存管理
 * - 加载进度回调
 * - WebP → PNG 格式降级
 * - LRU 内存控制
 */
export default class ImageLoader {
  /** 图片缓存池 */
  private cache = new Map<string, CacheEntry>()

  /** 正在加载中的请求（去重） */
  private pending = new Map<string, Promise<HTMLImageElement>>()

  /** 缓存上限（张数） */
  private maxCacheSize: number

  /** 是否支持 WebP（首次检测后缓存结果） */
  private static webpSupported: boolean | null = null

  constructor(maxCacheSize = 100) {
    this.maxCacheSize = maxCacheSize
  }

  // ==================== 公开 API ====================

  /**
   * 加载单张图片，优先从缓存读取
   * @param url 图片路径
   * @returns HTMLImageElement
   */
  async get(url: AssetPath): Promise<HTMLImageElement> {
    // 命中缓存
    const cached = this.cache.get(url)
    if (cached) {
      cached.lastAccess = Date.now()
      return cached.image
    }

    // 已有相同请求正在加载，复用 Promise
    const existingPending = this.pending.get(url)
    if (existingPending) {
      return existingPending
    }

    // 发起新加载
    const promise = this.loadImage(url)
    this.pending.set(url, promise)

    try {
      const image = await promise
      this.addToCache(url, image)
      return image
    } finally {
      this.pending.delete(url)
    }
  }

  /**
   * 批量预加载
   * @param urls 图片路径数组
   * @param onProgress 可选的进度回调
   * @returns 所有加载完成的 HTMLImageElement 数组
   */
  async preload(urls: AssetPath[], onProgress?: ProgressCallback): Promise<HTMLImageElement[]> {
    const total = urls.length
    let loaded = 0
    const results: HTMLImageElement[] = []

    // 并发加载，逐个汇报进度
    const promises = urls.map(async url => {
      const img = await this.get(url)
      loaded++
      onProgress?.(loaded, total)
      return img
    })

    const settled = await Promise.allSettled(promises)
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }

    return results
  }

  /**
   * 释放单张图片缓存
   */
  release(url: AssetPath): void {
    this.cache.delete(url)
  }

  /**
   * 清空全部缓存
   */
  clear(): void {
    this.cache.clear()
    this.pending.clear()
  }

  /**
   * 当前缓存数量
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * 检查某图片是否已缓存
   */
  has(url: AssetPath): boolean {
    return this.cache.has(url)
  }

  // ==================== 内部方法 ====================

  /**
   * 加载单张图片，支持 WebP 降级
   */
  private async loadImage(url: AssetPath): Promise<HTMLImageElement> {
    // 如果是 .webp 且浏览器不支持，尝试降级为 .png
    const finalUrl = await this.resolveUrl(url)
    return this.createImage(finalUrl)
  }

  /**
   * 创建 Image 对象并等待加载完成
   */
  private createImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`[ImageLoader] 加载失败: ${url}`))

      img.src = url
    })
  }

  /**
   * 处理 WebP → PNG 降级
   */
  private async resolveUrl(url: string): Promise<string> {
    if (!url.endsWith('.webp')) return url

    const supported = await ImageLoader.checkWebpSupport()
    if (supported) return url

    // 降级：.webp → .png
    return url.replace(/\.webp$/, '.png')
  }

  /**
   * 检测浏览器是否支持 WebP
   */
  private static checkWebpSupport(): Promise<boolean> {
    if (ImageLoader.webpSupported !== null) {
      return Promise.resolve(ImageLoader.webpSupported)
    }

    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        ImageLoader.webpSupported = img.width > 0 && img.height > 0
        resolve(ImageLoader.webpSupported)
      }
      img.onerror = () => {
        ImageLoader.webpSupported = false
        resolve(false)
      }
      // 1x1 WebP 测试图
      img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJYgCdAEO/hepgAAA'
    })
  }

  /**
   * 写入缓存，超出上限时淘汰最久未访问的条目（LRU）
   */
  private addToCache(url: string, image: HTMLImageElement): void {
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU()
    }
    this.cache.set(url, { image, lastAccess: Date.now() })
  }

  /**
   * 淘汰最久未访问的缓存条目
   */
  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }
}

/** 全局单例 */
export const imageLoader = new ImageLoader()
