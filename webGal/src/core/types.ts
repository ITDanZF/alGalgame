/**
 * @description: Galgame DAG 节点数据结构定义
 */

// ===================== 基础类型 =====================

/** 节点唯一标识 */
export type NodeId = string

/** 资源路径 */
export type AssetPath = string

/** 立绘位置 */
export type CharacterPosition = 'left' | 'center' | 'right'

/** 变量值类型 */
export type VariableValue = string | number | boolean

// ===================== 角色相关 =====================

/** 角色表情/立绘 */
export interface CharacterExpression {
  /** 表情标识，如 "smile", "angry", "shy" */
  name: string
  /** 立绘图片路径 */
  image: AssetPath
}

/** 角色定义 */
export interface Character {
  id: string
  /** 角色显示名称 */
  name: string
  /** 名称显示颜色（十六进制） */
  nameColor?: string
  /** 头像图片 */
  avatar?: AssetPath
  /** 表情/立绘集 */
  expressions: CharacterExpression[]
}

// ===================== 场景指令 =====================

/** 指令类型 */
export enum CommandType {
  /** 对话 */
  Dialogue = 'dialogue',
  /** 旁白/独白 */
  Narration = 'narration',
  /** 显示角色立绘 */
  ShowCharacter = 'showCharacter',
  /** 隐藏角色立绘 */
  HideCharacter = 'hideCharacter',
  /** 切换背景 */
  SetBackground = 'setBackground',
  /** 播放背景音乐 */
  PlayBGM = 'playBGM',
  /** 停止背景音乐 */
  StopBGM = 'stopBGM',
  /** 播放音效 */
  PlaySE = 'playSE',
  /** 播放角色语音 */
  PlayVoice = 'playVoice',
  /** 设置/修改变量 */
  SetVariable = 'setVariable',
  /** 显示屏幕特效 */
  ShowEffect = 'showEffect',
  /** 等待 */
  Wait = 'wait',
  /** AI 动态生成内容 */
  AIGenerate = 'aiGenerate'
}

/** 对话指令 */
export interface DialogueCommand {
  type: CommandType.Dialogue
  /** 说话角色 ID */
  characterId: string
  /** 角色表情（对应 CharacterExpression.name） */
  expression?: string
  /** 对话文本 */
  text: string
  /** 语音文件路径 */
  voice?: AssetPath
}

/** 旁白/独白指令 */
export interface NarrationCommand {
  type: CommandType.Narration
  /** 旁白文本 */
  text: string
}

/** 显示角色立绘 */
export interface ShowCharacterCommand {
  type: CommandType.ShowCharacter
  characterId: string
  expression: string
  position: CharacterPosition
  /** 入场动画名称 */
  transition?: string
  /** 动画时长(ms) */
  duration?: number
}

/** 隐藏角色立绘 */
export interface HideCharacterCommand {
  type: CommandType.HideCharacter
  characterId: string
  /** 退场动画名称 */
  transition?: string
  duration?: number
}

/** 设置背景 */
export interface SetBackgroundCommand {
  type: CommandType.SetBackground
  /** 背景图片路径 */
  image: AssetPath
  /** 转场效果名称 */
  transition?: string
  duration?: number
}

/** 播放背景音乐 */
export interface PlayBGMCommand {
  type: CommandType.PlayBGM
  audio: AssetPath
  /** 是否循环，默认 true */
  loop?: boolean
  /** 淡入时长(ms) */
  fadeIn?: number
  /** 音量 0~1 */
  volume?: number
}

/** 停止背景音乐 */
export interface StopBGMCommand {
  type: CommandType.StopBGM
  /** 淡出时长(ms) */
  fadeOut?: number
}

/** 播放音效 */
export interface PlaySECommand {
  type: CommandType.PlaySE
  audio: AssetPath
  volume?: number
}

/** 播放语音 */
export interface PlayVoiceCommand {
  type: CommandType.PlayVoice
  audio: AssetPath
  characterId?: string
}

/** 变量操作类型 */
export type VariableOperation = 'set' | 'add' | 'subtract' | 'toggle'

/** 设置变量 */
export interface SetVariableCommand {
  type: CommandType.SetVariable
  /** 变量名 */
  key: string
  /** 目标值 */
  value: VariableValue
  /** 操作方式，默认 'set' */
  operation?: VariableOperation
}

/** 屏幕特效 */
export interface ShowEffectCommand {
  type: CommandType.ShowEffect
  /** 特效名称，如 "shake", "flash", "rain" */
  effect: string
  duration?: number
  /** 特效参数 */
  params?: Record<string, unknown>
}

/** 等待指令 */
export interface WaitCommand {
  type: CommandType.Wait
  /** 等待时长(ms) */
  duration: number
}

/** AI 动态生成指令 —— 由 LLM 实时生成对话/旁白 */
export interface AIGenerateCommand {
  type: CommandType.AIGenerate
  /** 传给 LLM 的提示词 */
  prompt: string
  /** 生成角色 ID（生成对话时使用，空则为旁白） */
  characterId?: string
  /** 上下文引用的变量 key 列表 */
  contextVariables?: string[]
  /** 生成结果的最大 token 数 */
  maxTokens?: number
}

/** 所有指令的联合类型 */
export type SceneCommand = DialogueCommand | NarrationCommand | ShowCharacterCommand | HideCharacterCommand | SetBackgroundCommand | PlayBGMCommand | StopBGMCommand | PlaySECommand | PlayVoiceCommand | SetVariableCommand | ShowEffectCommand | WaitCommand | AIGenerateCommand

// ===================== 分支 & 转场 =====================

/** 条件比较运算符 */
export type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<='

/** 条件表达式 */
export interface Condition {
  /** 变量名 */
  variable: string
  operator: ConditionOperator
  value: VariableValue
}

/** 玩家选项 */
export interface Choice {
  /** 选项显示文本 */
  text: string
  /** 跳转目标节点 ID */
  targetNodeId: NodeId
  /** 显示此选项需满足的条件（全部满足才显示） */
  conditions?: Condition[]
  /** 选择后设置的变量 */
  effects?: Array<{ key: string; value: VariableValue }>
}

/** 转场方式 */
export enum TransitionType {
  /** 自动推进到下一节点 */
  Auto = 'auto',
  /** 玩家做出选择 */
  Choice = 'choice',
  /** 根据条件自动分支 */
  Conditional = 'conditional',
  /** 场景结束（叶子节点） */
  End = 'end'
}

/** 自动转场 */
export interface AutoTransition {
  type: TransitionType.Auto
  targetNodeId: NodeId
}

/** 选择转场 */
export interface ChoiceTransition {
  type: TransitionType.Choice
  /** 选择提示语 */
  prompt?: string
  /** 选项列表 */
  choices: Choice[]
}

/** 条件分支转场 */
export interface ConditionalTransition {
  type: TransitionType.Conditional
  /** 条件分支列表（按顺序匹配，首个满足的生效） */
  branches: Array<{
    conditions: Condition[]
    targetNodeId: NodeId
  }>
  /** 所有条件都不满足时的默认目标 */
  fallbackNodeId?: NodeId
}

/** 结束转场（该路线终点） */
export interface EndTransition {
  type: TransitionType.End
  /** 结局标识名称 */
  endingName?: string
  /** 结局类型 */
  endingType?: 'good' | 'normal' | 'bad' | 'true'
}

/** 所有转场的联合类型 */
export type Transition = AutoTransition | ChoiceTransition | ConditionalTransition | EndTransition

// ===================== 场景节点（DAG Value） =====================

/** 场景节点数据 —— 作为 DAG 中每个节点的 value 类型 */
export interface SceneNodeData {
  /** 场景标题（编辑器 / 调试用） */
  title: string
  /** 场景描述 */
  description?: string
  /** 指令序列，按数组顺序依次执行 */
  commands: SceneCommand[]
  /** 转场信息，决定该节点执行完后如何跳转 */
  transition?: Transition
  /** 标签，用于检索和分类 */
  tags?: string[]
  /** 扩展元数据 */
  metadata?: Record<string, unknown>
}

// ===================== 全局变量定义 =====================

/** 游戏变量定义 */
export interface VariableDefinition {
  /** 变量名 */
  key: string
  /** 默认值 */
  defaultValue: VariableValue
  /** 变量说明 */
  description?: string
}

// ===================== 游戏剧本（整体数据） =====================

/** 完整游戏剧本，可序列化为 JSON 持久化 */
export interface GameScript {
  /** 剧本唯一 ID */
  id: string
  /** 游戏标题 */
  title: string
  /** 版本号 */
  version: string
  /** 作者 */
  author?: string
  /** 角色定义列表 */
  characters: Character[]
  /** 全局变量定义 */
  variables: VariableDefinition[]
  /** 入口节点 ID（剧情起点） */
  entryNodeId: NodeId
  /** 所有场景节点 */
  nodes: Array<{ id: NodeId; value: SceneNodeData }>
  /** 节点间有向边 [from, to] */
  edges: Array<readonly [NodeId, NodeId]>
}

// ===================== 运行时状态 =====================

/** 存档 / 运行时游戏状态 */
export interface GameState {
  /** 当前所在节点 ID */
  currentNodeId: NodeId
  /** 当前节点内的指令执行位置 */
  commandIndex: number
  /** 运行时变量表 */
  variables: Record<string, VariableValue>
  /** 已访问过的节点 ID 集合（用于回想/CG 回收等） */
  visitedNodes: NodeId[]
  /** 对话历史（用于回看和送入 LLM 上下文） */
  dialogueHistory: Array<{
    characterId?: string
    text: string
    timestamp: number
  }>
  /** 存档时间戳 */
  savedAt?: number
}
