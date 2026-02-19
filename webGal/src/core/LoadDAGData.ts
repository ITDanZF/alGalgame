/**
 * @description: 加载 JSON 作为 DAG 数据
 *
 * 职责：
 *  1. 从 URL / 文件路径 / 原始对象加载 GameScript JSON
 *  2. 对数据进行结构校验（必填字段、节点 / 边引用一致性）
 *  3. 返回可直接传入 GalPlayDAG.loadScript() 的 GameScript
 */

import DAG from './DAG'
import type { NodeId, SceneNodeData, GameScript, Character, VariableDefinition } from './types'

// ===================== 错误类型 =====================

export class LoadDAGError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoadDAGError'
  }
}

// ===================== 校验结果 =====================

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ===================== LoadDAGData =====================

export default class LoadDAGData {
  // ────── 从 URL 加载 ──────

  /**
   * 通过 HTTP 请求加载 JSON 剧本
   * @param url 资源地址（支持相对 / 绝对路径）
   */
  static async fromURL(url: string): Promise<GameScript> {
    let data: unknown
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new LoadDAGError(`Failed to fetch "${url}": ${response.status} ${response.statusText}`)
      }
      data = await response.json()
    } catch (err) {
      if (err instanceof LoadDAGError) throw err
      throw new LoadDAGError(`Failed to load DAG data from "${url}": ${(err as Error).message}`)
    }

    return LoadDAGData.parse(data)
  }

  // ────── 从 JSON 字符串加载 ──────

  /**
   * 解析 JSON 字符串为 GameScript
   */
  static fromJSON(json: string): GameScript {
    let data: unknown
    try {
      data = JSON.parse(json)
    } catch {
      throw new LoadDAGError('Invalid JSON string')
    }
    return LoadDAGData.parse(data)
  }

  // ────── 从原始对象加载 ──────

  /**
   * 解析并校验一个 plain object 为 GameScript
   */
  static parse(data: unknown): GameScript {
    if (!data || typeof data !== 'object') {
      throw new LoadDAGError('Data must be a non-null object')
    }

    const script = data as Record<string, unknown>

    // ── 必填标量字段 ──
    LoadDAGData.assertString(script, 'id')
    LoadDAGData.assertString(script, 'title')
    LoadDAGData.assertString(script, 'version')
    LoadDAGData.assertString(script, 'entryNodeId')

    // ── 数组字段 ──
    LoadDAGData.assertArray(script, 'characters')
    LoadDAGData.assertArray(script, 'variables')
    LoadDAGData.assertArray(script, 'nodes')
    LoadDAGData.assertArray(script, 'edges')

    const gameScript = data as GameScript

    // ── 深度校验 ──
    const validation = LoadDAGData.validate(gameScript)
    if (!validation.valid) {
      throw new LoadDAGError(`Invalid GameScript:\n  - ${validation.errors.join('\n  - ')}`)
    }

    return gameScript
  }

  // ────── 校验 ──────

  /**
   * 对 GameScript 进行完整性校验
   */
  static validate(script: GameScript): ValidationResult {
    const errors: string[] = []

    // 1. 节点 ID 唯一性
    const nodeIds = new Set<NodeId>()
    for (const node of script.nodes) {
      if (!node.id) {
        errors.push('Found a node with empty id')
        continue
      }
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node id: "${node.id}"`)
      }
      nodeIds.add(node.id)
    }

    // 2. entryNodeId 存在
    if (!nodeIds.has(script.entryNodeId)) {
      errors.push(`entryNodeId "${script.entryNodeId}" does not match any node`)
    }

    // 3. 边引用的节点必须存在
    for (const [from, to] of script.edges) {
      if (!nodeIds.has(from)) {
        errors.push(`Edge source "${from}" is not a valid node id`)
      }
      if (!nodeIds.has(to)) {
        errors.push(`Edge target "${to}" is not a valid node id`)
      }
    }

    // 4. 转场引用的节点必须存在
    for (const node of script.nodes) {
      const t = node.value?.transition
      if (!t) continue

      if (t.type === 'auto' && !nodeIds.has(t.targetNodeId)) {
        errors.push(`Node "${node.id}" auto-transition targets unknown node "${t.targetNodeId}"`)
      }

      if (t.type === 'choice') {
        for (const choice of t.choices) {
          if (!nodeIds.has(choice.targetNodeId)) {
            errors.push(`Node "${node.id}" choice targets unknown node "${choice.targetNodeId}"`)
          }
        }
      }

      if (t.type === 'conditional') {
        for (const branch of t.branches) {
          if (!nodeIds.has(branch.targetNodeId)) {
            errors.push(`Node "${node.id}" conditional branch targets unknown node "${branch.targetNodeId}"`)
          }
        }
        if (t.fallbackNodeId && !nodeIds.has(t.fallbackNodeId)) {
          errors.push(`Node "${node.id}" conditional fallback targets unknown node "${t.fallbackNodeId}"`)
        }
      }
    }

    // 5. 变量 key 唯一性
    const varKeys = new Set<string>()
    for (const v of script.variables) {
      if (varKeys.has(v.key)) {
        errors.push(`Duplicate variable key: "${v.key}"`)
      }
      varKeys.add(v.key)
    }

    // 6. 角色 ID 唯一性
    const charIds = new Set<string>()
    for (const c of script.characters) {
      if (charIds.has(c.id)) {
        errors.push(`Duplicate character id: "${c.id}"`)
      }
      charIds.add(c.id)
    }

    // 7. DAG 无环检测
    try {
      const dag = new DAG<NodeId, SceneNodeData>({
        nodes: script.nodes.map(n => ({ id: n.id, value: n.value })),
        edges: script.edges
      })
      dag.topologicalSort()
    } catch {
      errors.push('The node graph contains a cycle — it is not a valid DAG')
    }

    return { valid: errors.length === 0, errors }
  }

  // ────── 构建 DAG 实例 ──────

  /**
   * 便捷方法：直接从 GameScript 构建 DAG 实例
   */
  static buildDAG(script: GameScript): DAG<NodeId, SceneNodeData> {
    return new DAG<NodeId, SceneNodeData>({
      nodes: script.nodes.map(n => ({ id: n.id, value: n.value })),
      edges: script.edges
    })
  }

  // ────── 序列化 ──────

  /**
   * 将 GameScript 序列化为格式化 JSON 字符串
   */
  static toJSON(script: GameScript, pretty = true): string {
    return JSON.stringify(script, null, pretty ? 2 : undefined)
  }

  // ────── 内部辅助 ──────

  private static assertString(obj: Record<string, unknown>, key: string): void {
    if (typeof obj[key] !== 'string' || (obj[key] as string).length === 0) {
      throw new LoadDAGError(`"${key}" must be a non-empty string`)
    }
  }

  private static assertArray(obj: Record<string, unknown>, key: string): void {
    if (!Array.isArray(obj[key])) {
      throw new LoadDAGError(`"${key}" must be an array`)
    }
  }
}
