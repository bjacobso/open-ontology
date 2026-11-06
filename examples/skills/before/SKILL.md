---
name: dispatch-work
description: "Use when a dispatcher wants to assign an open work order to a technician."
---

# dispatch-work

Use when a dispatcher wants to assign an open work order to a technician.

Required caller inputs: `workOrder`, `technician`.

## Preconditions

- Confirm the selected work order is open and the technician is qualified; ask if uncertain.

## Procedure

1. Review open work and confirm the caller's workOrder id. Call `query__unassigned-work` with no arguments.
2. Check that the technician list is not empty. Call `query__technicians` with no arguments; continue only if results are nonempty. Otherwise stop.
3. Confirm the caller's technician id appears in the returned rows. Call `query__technicians` with no arguments.
4. Assign the confirmed work order. Call `action__assign-work-order` with `workOrder=$workOrder`, `technician=$technician`.
5. Report the assignment to the dispatcher. Call `query__assigned-work` with no arguments.

## Tool contracts

### action__assign-work-order

```json
{
  "name": "action__assign-work-order",
  "kind": "action",
  "declaration": "assign-work-order",
  "description": "Invoke assign-work-order as one Triplex transaction.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "workOrder": {
        "type": "string"
      },
      "technician": {
        "type": "string"
      }
    },
    "required": [
      "workOrder",
      "technician"
    ],
    "additionalProperties": false
  }
}
```

### query__assigned-work

```json
{
  "name": "query__assigned-work",
  "kind": "query",
  "declaration": "assigned-work",
  "description": "Run assigned-work; return all matching rows.",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "outputColumns": [
    "?title",
    "?technician"
  ]
}
```

### query__unassigned-work

```json
{
  "name": "query__unassigned-work",
  "kind": "query",
  "declaration": "unassigned-work",
  "description": "Run unassigned-work; return all matching rows.",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "outputColumns": [
    "?workOrder",
    "?title"
  ]
}
```

### query__technicians

```json
{
  "name": "query__technicians",
  "kind": "query",
  "declaration": "technicians",
  "description": "Run technicians; return all matching rows.",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "outputColumns": [
    "?technician",
    "?name"
  ]
}
```

## Examples

Assign work-order:42 to technician:ada after confirming both ids.

```json
{
  "workOrder": "work-order:42",
  "technician": "technician:ada"
}
```

## Execution boundary

The agent follows this procedure. Guards and preconditions are instructions; each action is a separate transaction. The host must enforce authorization and recheck state when it matters.
