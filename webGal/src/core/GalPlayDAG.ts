/**
 * @description: GalPlayDAG 基于 DAG（有向无环图）的剧情播放引擎。
 *
 * 职责：
 *  1. 根据 GameScript 构建 DAG 并驱动剧情推进
 *  2. 维护运行时 GameState（变量、历史、存档等）
 *  3. 逐条执行节点内的 SceneCommand，通过事件回调通知 UI 层
 *  4. 处理转场逻辑（Auto / Choice / Conditional / End）
 */

import DAG from './DAG'
import type { NodeId, SceneNodeData, SceneCommand, GameScript, GameState, VariableValue, VariableDefinition, Character, Condition, ConditionOperator, Choice, Transition, AutoTransition, ChoiceTransition, ConditionalTransition, EndTransition } from './types'
import { TransitionType, CommandType } from './types'

// ===================== 事件类型 =====================

/** 引擎对外抛出的事件名称 */
export enum GalEvent {
  /** 执行一条指令（UI 据此渲染对话、立绘、背景等） */
  Command = 'command',
  /** 需要玩家做出选择 */
  ChoiceRequest = 'choiceRequest',
  /** 节点播放完毕 */
  NodeEnd = 'nodeEnd',
  /** 剧情到达结局 */
  Ending = 'ending',
  /** 自动推进到下一节点 */
  AutoAdvance = 'autoAdvance',
  /** 游戏状态发生变化 */
  StateChange = 'stateChange',
  /** 出错 */
  Error = 'error'
}

export interface GalEventMap {
  [GalEvent.Command]: { command: SceneCommand; index: number; nodeId: NodeId }
  [GalEvent.ChoiceRequest]: {
    prompt?: string
    choices: Array<Choice & { visible: boolean }>
    nodeId: NodeId
  }
  [GalEvent.NodeEnd]: { nodeId: NodeId }
  [GalEvent.Ending]: { endingName?: string; endingType?: string; nodeId: NodeId }
  [GalEvent.AutoAdvance]: { fromNodeId: NodeId; toNodeId: NodeId }
  [GalEvent.StateChange]: { state: GameState }
  [GalEvent.Error]: { message: string; error?: unknown }
}

type EventCallback<T = unknown> = (payload: T) => void

// ===================== GalPlayDAG =====================

export default class GalPlayDAG {
  /** 内部 DAG 实例 */
  private dag: DAG<NodeId, SceneNodeData>

  /** 运行时游戏状态 */
  private state: GameState

  /** 角色表（id → Character） */
  private characters: Map<string, Character> = new Map()

  /** 变量定义表 */
  private variableDefs: Map<string, VariableDefinition> = new Map()

  /** 事件监听器 */
  private listeners = new Map<GalEvent, Set<EventCallback<any>>>()

  /** 是否正在播放（防止重入） */
  private playing = false

  /** 是否暂停 */
  private paused = false

  /** 是否已到达结局 */
  private ended = false

  // ────── 构造 & 初始化 ──────

  constructor() {
    this.dag = new DAG<NodeId, SceneNodeData>()
    this.state = GalPlayDAG.createEmptyState()
  }

  /**
   * 从 GameScript 初始化引擎（重置所有状态）
   */
  loadScript(script: GameScript): void {
    this.dag = new DAG<NodeId, SceneNodeData>({
      nodes: script.nodes.map(n => ({ id: n.id, value: n.value })),
      edges: script.edges
    })

    // 角色表
    this.characters.clear()
    for (const char of script.characters) {
      this.characters.set(char.id, char)
    }

    // 变量定义
    this.variableDefs.clear()
    const variables: Record<string, VariableValue> = {}
    for (const def of script.variables) {
      this.variableDefs.set(def.key, def)
      variables[def.key] = def.defaultValue
    }

    // 初始状态
    this.state = {
      currentNodeId: script.entryNodeId,
      commandIndex: 0,
      variables,
      visitedNodes: [],
      dialogueHistory: []
    }

    this.playing = false
    this.paused = false
    this.ended = false
  }

  // ────── 事件系统 ──────

  on<E extends GalEvent>(event: E, callback: EventCallback<GalEventMap[E]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
    return () => this.off(event, callback)
  }

  off<E extends GalEvent>(event: E, callback: EventCallback<GalEventMap[E]>): void {
    this.listeners.get(event)?.delete(callback)
  }

  private emit<E extends GalEvent>(event: E, payload: GalEventMap[E]): void {
    const cbs = this.listeners.get(event)
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(payload)
        } catch (err) {
          console.error(`[GalPlayDAG] Error in listener for ${String(event)}:`, err)
        }
      }
    }
  }

  // ────── 播放控制 ──────

  /**
   * 开始 / 继续播放当前节点的下一条指令。
   * 每次调用推进一条指令；指令全部执行完毕后自动处理转场。
   */
  next(): void {
    if (this.ended) return
    if (this.paused) return

    const nodeData = this.dag.getNodeValue(this.state.currentNodeId)
    if (!nodeData) {
      this.emit(GalEvent.Error, {
        message: `Node not found: ${this.state.currentNodeId}`
      })
      return
    }

    const { commands } = nodeData

    // 还有指令未执行
    if (this.state.commandIndex < commands.length) {
      const cmd = commands[this.state.commandIndex]
      this.executeCommand(cmd)
      this.state.commandIndex++
      this.emitStateChange()
      return
    }

    // 当前节点的指令已全部执行完毕，处理转场
    this.emit(GalEvent.NodeEnd, { nodeId: this.state.currentNodeId })
    this.handleTransition(nodeData.transition)
  }

  /**
   * 玩家做出选择后调用，传入目标节点 ID
   */
  selectChoice(choiceIndex: number): void {
    const nodeData = this.dag.getNodeValue(this.state.currentNodeId)
    if (!nodeData?.transition || nodeData.transition.type !== TransitionType.Choice) {
      this.emit(GalEvent.Error, { message: 'Current node is not a choice node' })
      return
    }

    const transition = nodeData.transition as ChoiceTransition
    const visibleChoices = transition.choices.filter(c => this.evaluateChoiceVisible(c))

    if (choiceIndex < 0 || choiceIndex >= visibleChoices.length) {
      this.emit(GalEvent.Error, { message: `Invalid choice index: ${choiceIndex}` })
      return
    }

    const choice = visibleChoices[choiceIndex]

    // 应用选择带来的变量副作用
    if (choice.effects) {
      for (const effect of choice.effects) {
        this.state.variables[effect.key] = effect.value
      }
    }

    this.jumpToNode(choice.targetNodeId)
  }

  /** 暂停播放 */
  pause(): void {
    this.paused = true
  }

  /** 恢复播放 */
  resume(): void {
    this.paused = false
  }

  /** 重新开始（需要先 loadScript） */
  restart(entryNodeId?: NodeId): void {
    const entry = entryNodeId ?? this.dag.roots()[0]
    if (!entry) {
      this.emit(GalEvent.Error, { message: 'No entry node found' })
      return
    }

    const variables: Record<string, VariableValue> = {}
    for (const [key, def] of this.variableDefs) {
      variables[key] = def.defaultValue
    }

    this.state = {
      currentNodeId: entry,
      commandIndex: 0,
      variables,
      visitedNodes: [],
      dialogueHistory: []
    }

    this.playing = false
    this.paused = false
    this.ended = false
    this.emitStateChange()
  }

  // ────── 指令执行 ──────

  private executeCommand(cmd: SceneCommand): void {
    // 处理对话 / 旁白的历史记录
    if (cmd.type === CommandType.Dialogue) {
      this.state.dialogueHistory.push({
        characterId: cmd.characterId,
        text: cmd.text,
        timestamp: Date.now()
      })
    } else if (cmd.type === CommandType.Narration) {
      this.state.dialogueHistory.push({
        text: cmd.text,
        timestamp: Date.now()
      })
    }

    // 处理 SetVariable 指令
    if (cmd.type === CommandType.SetVariable) {
      this.applyVariable(cmd.key, cmd.value, cmd.operation ?? 'set')
    }

    // 将指令抛出给 UI 层渲染
    this.emit(GalEvent.Command, {
      command: cmd,
      index: this.state.commandIndex,
      nodeId: this.state.currentNodeId
    })
  }

  // ────── 转场处理 ──────

  private handleTransition(transition?: Transition): void {
    // 无转场信息 → 尝试自动跳转到唯一后继
    if (!transition) {
      const successors = this.dag.successors(this.state.currentNodeId)
      if (successors.length === 1) {
        this.jumpToNode(successors[0])
      } else if (successors.length === 0) {
        this.doEnding()
      } else {
        this.emit(GalEvent.Error, {
          message: `Node "${this.state.currentNodeId}" has multiple successors but no transition defined`
        })
      }
      return
    }

    switch (transition.type) {
      case TransitionType.Auto:
        this.handleAutoTransition(transition)
        break
      case TransitionType.Choice:
        this.handleChoiceTransition(transition)
        break
      case TransitionType.Conditional:
        this.handleConditionalTransition(transition)
        break
      case TransitionType.End:
        this.handleEndTransition(transition)
        break
    }
  }

  private handleAutoTransition(t: AutoTransition): void {
    this.emit(GalEvent.AutoAdvance, {
      fromNodeId: this.state.currentNodeId,
      toNodeId: t.targetNodeId
    })
    this.jumpToNode(t.targetNodeId)
  }

  private handleChoiceTransition(t: ChoiceTransition): void {
    const choices = t.choices.map(c => ({
      ...c,
      visible: this.evaluateChoiceVisible(c)
    }))

    this.emit(GalEvent.ChoiceRequest, {
      prompt: t.prompt,
      choices,
      nodeId: this.state.currentNodeId
    })
    // 等待玩家调用 selectChoice()
  }

  private handleConditionalTransition(t: ConditionalTransition): void {
    for (const branch of t.branches) {
      if (this.evaluateConditions(branch.conditions)) {
        this.jumpToNode(branch.targetNodeId)
        return
      }
    }

    if (t.fallbackNodeId) {
      this.jumpToNode(t.fallbackNodeId)
    } else {
      this.emit(GalEvent.Error, {
        message: `No conditional branch matched and no fallback defined at node "${this.state.currentNodeId}"`
      })
    }
  }

  private handleEndTransition(t: EndTransition): void {
    this.doEnding(t.endingName, t.endingType)
  }

  private doEnding(endingName?: string, endingType?: string): void {
    this.ended = true
    this.emit(GalEvent.Ending, {
      endingName,
      endingType,
      nodeId: this.state.currentNodeId
    })
  }

  // ────── 节点跳转 ──────

  private jumpToNode(targetId: NodeId): void {
    if (!this.dag.hasNode(targetId)) {
      this.emit(GalEvent.Error, { message: `Target node not found: ${targetId}` })
      return
    }

    // 记录已访问
    if (!this.state.visitedNodes.includes(this.state.currentNodeId)) {
      this.state.visitedNodes.push(this.state.currentNodeId)
    }

    this.state.currentNodeId = targetId
    this.state.commandIndex = 0
    this.emitStateChange()
  }

  // ────── 条件求值 ──────

  private evaluateChoiceVisible(choice: Choice): boolean {
    if (!choice.conditions || choice.conditions.length === 0) return true
    return this.evaluateConditions(choice.conditions)
  }

  private evaluateConditions(conditions: Condition[]): boolean {
    return conditions.every(c => this.evaluateCondition(c))
  }

  private evaluateCondition(condition: Condition): boolean {
    const current = this.state.variables[condition.variable]
    const target = condition.value

    switch (condition.operator as ConditionOperator) {
      case '==':
        return current == target
      case '!=':
        return current != target
      case '>':
        return Number(current) > Number(target)
      case '<':
        return Number(current) < Number(target)
      case '>=':
        return Number(current) >= Number(target)
      case '<=':
        return Number(current) <= Number(target)
      default:
        return false
    }
  }

  // ────── 变量操作 ──────

  private applyVariable(key: string, value: VariableValue, operation: string): void {
    switch (operation) {
      case 'set':
        this.state.variables[key] = value
        break
      case 'add':
        this.state.variables[key] = (Number(this.state.variables[key]) || 0) + Number(value)
        break
      case 'subtract':
        this.state.variables[key] = (Number(this.state.variables[key]) || 0) - Number(value)
        break
      case 'toggle':
        this.state.variables[key] = !this.state.variables[key]
        break
    }
  }

  // ────── 状态查询 & 存档 ──────

  /** 获取当前运行时状态的深拷贝 */
  getState(): GameState {
    return structuredClone(this.state)
  }

  /** 从存档恢复状态 */
  loadState(saved: GameState): void {
    this.state = structuredClone(saved)
    this.ended = false
    this.paused = false
    this.emitStateChange()
  }

  /** 导出存档 */
  save(): GameState {
    const snapshot = this.getState()
    snapshot.savedAt = Date.now()
    return snapshot
  }

  /** 获取变量值 */
  getVariable(key: string): VariableValue | undefined {
    return this.state.variables[key]
  }

  /** 设置变量值（外部直接修改） */
  setVariable(key: string, value: VariableValue): void {
    this.state.variables[key] = value
    this.emitStateChange()
  }

  /** 获取角色信息 */
  getCharacter(id: string): Character | undefined {
    return this.characters.get(id)
  }

  /** 获取所有角色 */
  getCharacters(): Character[] {
    return Array.from(this.characters.values())
  }

  /** 获取当前节点数据 */
  getCurrentNode(): SceneNodeData | undefined {
    return this.dag.getNodeValue(this.state.currentNodeId)
  }

  /** 获取当前节点 ID */
  getCurrentNodeId(): NodeId {
    return this.state.currentNodeId
  }

  /** 获取对话历史 */
  getDialogueHistory(): GameState['dialogueHistory'] {
    return [...this.state.dialogueHistory]
  }

  /** 是否处于结局 */
  isEnded(): boolean {
    return this.ended
  }

  /** 是否暂停 */
  isPaused(): boolean {
    return this.paused
  }

  /** 节点是否已访问过 */
  isNodeVisited(nodeId: NodeId): boolean {
    return this.state.visitedNodes.includes(nodeId)
  }

  /** 获取内部 DAG（只读用途，如可视化） */
  getDAG(): DAG<NodeId, SceneNodeData> {
    return this.dag
  }

  // ────── 内部工具 ──────

  private emitStateChange(): void {
    this.emit(GalEvent.StateChange, { state: this.getState() })
  }

  private static createEmptyState(): GameState {
    return {
      currentNodeId: '',
      commandIndex: 0,
      variables: {},
      visitedNodes: [],
      dialogueHistory: []
    }
  }
}
