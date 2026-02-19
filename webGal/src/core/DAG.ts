/**
 * @description: DAG（有向无环图）数据结构实现
 */
export type DAGNodeKey = string | number | symbol

export interface DAGNode<K extends DAGNodeKey, V> {
  id: K
  value: V
}

export interface DAGSerialized<K extends DAGNodeKey, V> {
  nodes: Array<DAGNode<K, V>>
  edges: Array<readonly [K, K]>
}

export interface DAGConstructorOptions<K extends DAGNodeKey, V> {
  nodes?: Array<DAGNode<K, V>>
  edges?: Array<readonly [K, K]>
}

export class DAGError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DAGError'
  }
}

export default class DAG<K extends DAGNodeKey = string, V = unknown> {
  private readonly nodeMap = new Map<K, V>()
  private readonly outgoing = new Map<K, Set<K>>()
  private readonly incoming = new Map<K, Set<K>>()

  constructor(options: DAGConstructorOptions<K, V> = {}) {
    if (options.nodes) {
      for (const node of options.nodes) {
        this.addNode(node.id, node.value)
      }
    }

    if (options.edges) {
      for (const [from, to] of options.edges) {
        this.addEdge(from, to)
      }
    }
  }

  get size(): number {
    return this.nodeMap.size
  }

  get edgeSize(): number {
    let count = 0
    for (const targets of this.outgoing.values()) {
      count += targets.size
    }
    return count
  }

  hasNode(id: K): boolean {
    return this.nodeMap.has(id)
  }

  addNode(id: K, value: V): this {
    if (this.nodeMap.has(id)) {
      throw new DAGError(`Node already exists: ${String(id)}`)
    }
    this.nodeMap.set(id, value)
    this.outgoing.set(id, new Set<K>())
    this.incoming.set(id, new Set<K>())
    return this
  }

  upsertNode(id: K, value: V): this {
    if (!this.nodeMap.has(id)) {
      this.outgoing.set(id, new Set<K>())
      this.incoming.set(id, new Set<K>())
    }
    this.nodeMap.set(id, value)
    return this
  }

  getNodeValue(id: K): V | undefined {
    return this.nodeMap.get(id)
  }

  setNodeValue(id: K, value: V): this {
    if (!this.nodeMap.has(id)) {
      throw new DAGError(`Node does not exist: ${String(id)}`)
    }
    this.nodeMap.set(id, value)
    return this
  }

  removeNode(id: K): boolean {
    if (!this.nodeMap.has(id)) {
      return false
    }

    const parents = this.incoming.get(id)
    if (parents) {
      for (const parent of parents) {
        this.outgoing.get(parent)?.delete(id)
      }
    }

    const children = this.outgoing.get(id)
    if (children) {
      for (const child of children) {
        this.incoming.get(child)?.delete(id)
      }
    }

    this.incoming.delete(id)
    this.outgoing.delete(id)
    this.nodeMap.delete(id)
    return true
  }

  clear(): void {
    this.nodeMap.clear()
    this.outgoing.clear()
    this.incoming.clear()
  }

  hasEdge(from: K, to: K): boolean {
    return this.outgoing.get(from)?.has(to) ?? false
  }

  addEdge(from: K, to: K): this {
    this.assertNodeExists(from)
    this.assertNodeExists(to)

    if (from === to) {
      throw new DAGError(`Self loop is not allowed: ${String(from)} -> ${String(to)}`)
    }

    const targets = this.outgoing.get(from)!
    if (targets.has(to)) {
      return this
    }

    if (this.hasPath(to, from)) {
      throw new DAGError(`Adding edge creates cycle: ${String(from)} -> ${String(to)}`)
    }

    targets.add(to)
    this.incoming.get(to)!.add(from)
    return this
  }

  removeEdge(from: K, to: K): boolean {
    const targets = this.outgoing.get(from)
    if (!targets || !targets.has(to)) {
      return false
    }
    targets.delete(to)
    this.incoming.get(to)?.delete(from)
    return true
  }

  inDegree(id: K): number {
    this.assertNodeExists(id)
    return this.incoming.get(id)!.size
  }

  outDegree(id: K): number {
    this.assertNodeExists(id)
    return this.outgoing.get(id)!.size
  }

  predecessors(id: K): K[] {
    this.assertNodeExists(id)
    return Array.from(this.incoming.get(id)!)
  }

  successors(id: K): K[] {
    this.assertNodeExists(id)
    return Array.from(this.outgoing.get(id)!)
  }

  roots(): K[] {
    const result: K[] = []
    for (const id of this.nodeMap.keys()) {
      if ((this.incoming.get(id)?.size ?? 0) === 0) {
        result.push(id)
      }
    }
    return result
  }

  leaves(): K[] {
    const result: K[] = []
    for (const id of this.nodeMap.keys()) {
      if ((this.outgoing.get(id)?.size ?? 0) === 0) {
        result.push(id)
      }
    }
    return result
  }

  hasPath(from: K, to: K): boolean {
    this.assertNodeExists(from)
    this.assertNodeExists(to)

    if (from === to) {
      return true
    }

    const visited = new Set<K>([from])
    const stack: K[] = [from]

    while (stack.length > 0) {
      const current = stack.pop()!
      const nextSet = this.outgoing.get(current)
      if (!nextSet) {
        continue
      }

      for (const next of nextSet) {
        if (next === to) {
          return true
        }
        if (!visited.has(next)) {
          visited.add(next)
          stack.push(next)
        }
      }
    }

    return false
  }

  topologicalSort(): K[] {
    const indegrees = new Map<K, number>()
    for (const id of this.nodeMap.keys()) {
      indegrees.set(id, this.incoming.get(id)?.size ?? 0)
    }

    const queue: K[] = []
    for (const [id, degree] of indegrees) {
      if (degree === 0) {
        queue.push(id)
      }
    }

    const order: K[] = []
    let index = 0
    while (index < queue.length) {
      const current = queue[index++]
      order.push(current)

      for (const next of this.outgoing.get(current) ?? []) {
        const nextDegree = (indegrees.get(next) ?? 0) - 1
        indegrees.set(next, nextDegree)
        if (nextDegree === 0) {
          queue.push(next)
        }
      }
    }

    if (order.length !== this.nodeMap.size) {
      throw new DAGError('Graph is not a DAG. Cycle detected.')
    }

    return order
  }

  ancestors(id: K): K[] {
    this.assertNodeExists(id)
    return this.traverseFrom(id, this.incoming)
  }

  descendants(id: K): K[] {
    this.assertNodeExists(id)
    return this.traverseFrom(id, this.outgoing)
  }

  nodes(): Array<DAGNode<K, V>> {
    const result: Array<DAGNode<K, V>> = []
    for (const [id, value] of this.nodeMap.entries()) {
      result.push({ id, value })
    }
    return result
  }

  edges(): Array<readonly [K, K]> {
    const result: Array<readonly [K, K]> = []
    for (const [from, targets] of this.outgoing.entries()) {
      for (const to of targets) {
        result.push([from, to])
      }
    }
    return result
  }

  serialize(): DAGSerialized<K, V> {
    return {
      nodes: this.nodes(),
      edges: this.edges()
    }
  }

  clone(): DAG<K, V> {
    return new DAG<K, V>(this.serialize())
  }

  static from<K extends DAGNodeKey, V>(serialized: DAGSerialized<K, V>): DAG<K, V> {
    return new DAG<K, V>(serialized)
  }

  private assertNodeExists(id: K): void {
    if (!this.nodeMap.has(id)) {
      throw new DAGError(`Node does not exist: ${String(id)}`)
    }
  }

  private traverseFrom(id: K, adjacency: Map<K, Set<K>>): K[] {
    const visited = new Set<K>()
    const stack: K[] = [...(adjacency.get(id) ?? [])]

    while (stack.length > 0) {
      const current = stack.pop()!
      if (visited.has(current)) {
        continue
      }

      visited.add(current)
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          stack.push(next)
        }
      }
    }

    return Array.from(visited)
  }
}
