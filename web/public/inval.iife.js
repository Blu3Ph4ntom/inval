"use strict";
var inval = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    InvalCycleError: () => InvalCycleError,
    ancestors: () => ancestors,
    batch: () => batch,
    checkForCycles: () => checkForCycles,
    descendants: () => descendants,
    graphSize: () => graphSize,
    input: () => input,
    node: () => node,
    resetIdCounter: () => resetIdCounter,
    stats: () => stats,
    toDot: () => toDot,
    why: () => why
  });

  // src/types.ts
  var nextId = 0;
  function generateId() {
    return `n${nextId++}`;
  }
  function resetIdCounter() {
    nextId = 0;
  }

  // src/graph.ts
  var InvalCycleError = class extends Error {
    constructor(path) {
      super(`Cycle detected: ${path.join(" \u2192 ")}`);
      this.name = "InvalCycleError";
    }
  };
  function checkForCycles(roots) {
    const visiting = /* @__PURE__ */ new Set();
    const visited = /* @__PURE__ */ new Set();
    function dfs(node2, path) {
      if (visited.has(node2)) return;
      if (visiting.has(node2)) {
        throw new InvalCycleError([...path, node2.id]);
      }
      visiting.add(node2);
      path.push(node2.id);
      if (node2.kind === "computed") {
        for (const parent of node2._parents) {
          dfs(parent, path);
        }
      }
      path.pop();
      visiting.delete(node2);
      visited.add(node2);
    }
    for (const root of roots) {
      dfs(root, []);
    }
  }
  function markDirty(source) {
    const visited = /* @__PURE__ */ new Set();
    const queue = [];
    for (const child of source._children) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
    let i = 0;
    while (i < queue.length) {
      const node2 = queue[i++];
      for (const child of node2._children) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      }
    }
    for (const child of queue) {
      child._dirty = true;
    }
  }
  function why(target) {
    if (target.kind === "computed" && !target._dirty) return [];
    const path = [];
    const visited = /* @__PURE__ */ new Set();
    function trace(node2) {
      if (visited.has(node2)) return;
      visited.add(node2);
      path.push(node2.id);
      if (node2.kind === "computed") {
        for (const parent of node2._parents) {
          if (parent.kind === "computed" && parent._dirty) {
            trace(parent);
          } else if (parent.kind === "input" && !visited.has(parent)) {
            visited.add(parent);
            path.push(parent.id);
          }
        }
      }
    }
    trace(target);
    return path;
  }
  function ancestors(node2) {
    const result = [];
    const visited = /* @__PURE__ */ new Set();
    function walk(n) {
      if (visited.has(n)) return;
      visited.add(n);
      result.push(n);
      if (n.kind === "computed") {
        for (const parent of n._parents) {
          walk(parent);
        }
      }
    }
    walk(node2);
    return result;
  }
  function descendants(node2) {
    const result = [];
    const visited = /* @__PURE__ */ new Set();
    function walk(n) {
      if (visited.has(n)) return;
      visited.add(n);
      result.push(n);
      for (const child of n._children) {
        walk(child);
      }
    }
    walk(node2);
    return result;
  }
  function graphSize(root) {
    return ancestors(root).length;
  }

  // src/batch.ts
  var inBatch = false;
  var batchedInputs = /* @__PURE__ */ new Set();
  function batch(fn) {
    if (inBatch) {
      throw new Error("Cannot nest batch() calls");
    }
    inBatch = true;
    batchedInputs.clear();
    try {
      fn();
    } finally {
      inBatch = false;
    }
    const changed = collectDirtied(batchedInputs);
    batchedInputs.clear();
    return changed;
  }
  function trackInput(node2) {
    if (inBatch) {
      batchedInputs.add(node2);
    }
  }
  function collectDirtied(inputs) {
    const changed = /* @__PURE__ */ new Set();
    const queue = [...inputs];
    const visited = /* @__PURE__ */ new Set();
    while (queue.length > 0) {
      const node2 = queue.shift();
      if (visited.has(node2)) continue;
      visited.add(node2);
      changed.add(node2);
      for (const child of node2._children) {
        queue.push(child);
      }
    }
    return changed;
  }
  function isInBatch() {
    return inBatch;
  }

  // src/node.ts
  function input(value) {
    const self = {
      kind: "input",
      id: generateId(),
      _children: /* @__PURE__ */ new Set(),
      _value: value,
      _dirty: false,
      _disposed: false,
      get() {
        return self._value;
      },
      set(newValue) {
        if (Object.is(self._value, newValue)) return;
        self._value = newValue;
        if (isInBatch()) trackInput(self);
        markDirty(self);
      },
      invalidate() {
        if (isInBatch()) trackInput(self);
        markDirty(self);
      },
      isDirty() {
        return false;
      },
      inspect() {
        return {
          id: self.id,
          kind: "input",
          dirty: false,
          lastValue: self._value,
          computeCount: 0,
          depCount: 0,
          childCount: self._children.size
        };
      },
      dispose() {
        self._disposed = true;
        for (const child of self._children) {
          child._parents = child._parents.filter((p) => p !== self);
        }
        self._children.clear();
      }
    };
    return self;
  }
  function node(options) {
    const depEntries = Object.entries(options.dependsOn);
    const depKeys = depEntries.map(([k]) => k);
    const depNodes = depEntries.map(([, v]) => v);
    checkForCycles(depNodes);
    const self = {
      kind: "computed",
      id: generateId(),
      _parents: depNodes,
      _children: /* @__PURE__ */ new Set(),
      _compute: options.compute,
      _depKeys: depKeys,
      _depNodes: depNodes,
      _value: void 0,
      _dirty: true,
      _computeCount: 0,
      _disposed: false,
      get() {
        if (self._dirty) {
          recompute(self);
        }
        return self._value;
      },
      invalidate() {
        if (self._dirty) return;
        self._dirty = true;
        markDirty(self);
      },
      isDirty() {
        return self._dirty;
      },
      inspect() {
        return {
          id: self.id,
          kind: "computed",
          dirty: self._dirty,
          lastValue: self._value,
          computeCount: self._computeCount,
          depCount: self._depNodes.length,
          childCount: self._children.size
        };
      },
      dispose() {
        self._disposed = true;
        for (const parent of self._parents) {
          parent._children.delete(self);
        }
        for (const child of self._children) {
          child._parents = child._parents.filter((p) => p !== self);
        }
        self._parents = [];
        self._children.clear();
      }
    };
    for (const parent of depNodes) {
      parent._children.add(self);
    }
    return self;
  }
  function recompute(self) {
    const deps = {};
    for (let i = 0; i < self._depKeys.length; i++) {
      deps[self._depKeys[i]] = self._depNodes[i].get();
    }
    self._value = self._compute(deps);
    self._dirty = false;
    self._computeCount++;
  }

  // src/debug.ts
  function toDot(nodes) {
    const lines = ["digraph inval {"];
    const visited = /* @__PURE__ */ new Set();
    function addNode(node2) {
      if (visited.has(node2)) return;
      visited.add(node2);
      const label = node2.kind === "input" ? `${node2.id} [input]` : `${node2.id} [computed]`;
      lines.push(`  "${node2.id}" [label="${label}"];`);
      if (node2.kind === "computed") {
        for (const parent of node2._parents) {
          lines.push(`  "${parent.id}" -> "${node2.id}";`);
          addNode(parent);
        }
      }
    }
    for (const node2 of nodes) {
      addNode(node2);
    }
    lines.push("}");
    return lines.join("\n");
  }
  function stats(nodes) {
    let inputCount = 0;
    let computedCount = 0;
    let edgeCount = 0;
    let totalComputeCalls = 0;
    const visited = /* @__PURE__ */ new Set();
    function count(node2) {
      if (visited.has(node2)) return;
      visited.add(node2);
      if (node2.kind === "input") {
        inputCount++;
      } else {
        computedCount++;
        edgeCount += node2._parents.length;
        totalComputeCalls += node2._computeCount;
        for (const parent of node2._parents) {
          count(parent);
        }
      }
    }
    for (const node2 of nodes) {
      count(node2);
    }
    return {
      nodeCount: inputCount + computedCount,
      inputCount,
      computedCount,
      edgeCount,
      totalComputeCalls
    };
  }
  return __toCommonJS(index_exports);
})();
