/**
 * Best-effort compiler from the portable IR to an `@osdk/maker` module, the TypeScript source
 * format of Palantir Foundry's Ontology as Code. The output is text; this package does not
 * depend on `@osdk/maker` at run time.
 */
import type {
  ActionInputIR,
  ActionTypeIR,
  ActionValueIR,
  LinkTypeIR,
  ObjectTypeIR,
  OntologyIR,
  OntologyValueTypeIR,
  PropertyIR,
} from "./ir.js";

export interface FoundryDiagnostic {
  readonly severity: "warning";
  readonly declaration: string;
  readonly message: string;
}

export interface OsdkMakerModule {
  /** TypeScript source that registers the ontology with `@osdk/maker` when imported. */
  readonly source: string;
  /** Model features that were approximated or left out of the source. */
  readonly diagnostics: readonly FoundryDiagnostic[];
}

class Code {
  constructor(readonly text: string) {}
}

type Literal =
  | Code
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Literal[]
  | { readonly [key: string]: Literal };

const code = (text: string): Code => new Code(text);

const renderKey = (key: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);

const entriesOf = (value: { readonly [key: string]: Literal }) =>
  Object.entries(value).filter(([, item]) => item !== undefined);

const renderFlat = (value: Literal): string => {
  if (value instanceof Code) return value.text;
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(renderFlat).join(", ")}]`;
  const entries = entriesOf(value as { readonly [key: string]: Literal });
  if (entries.length === 0) return "{}";
  return `{ ${entries.map(([key, item]) => `${renderKey(key)}: ${renderFlat(item)}`).join(", ")} }`;
};

const render = (value: Literal, indent = ""): string => {
  const flat = renderFlat(value);
  if (value instanceof Code || value === null || typeof value !== "object") return flat;
  if (indent.length + flat.length <= 96) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((item: Literal) => `${inner}${render(item, inner)},`).join("\n")}\n${indent}]`;
  }
  const entries = entriesOf(value as { readonly [key: string]: Literal });
  return `{\n${entries.map(([key, item]) => `${inner}${renderKey(key)}: ${render(item, inner)},`).join("\n")}\n${indent}}`;
};

const words = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());

/** An entity's words in their original case, using its field namespace to keep compounds such as GitHub whole. */
const entityWords = (object: ObjectTypeIR): string[] => {
  const key = object.properties[0]?.key;
  const hint = key === undefined ? [] : words(key.slice(1, key.indexOf("/")));
  if (hint.join("") !== object.name.toLowerCase()) {
    return object.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ");
  }
  let offset = 0;
  return hint.map((word) => object.name.slice(offset, (offset += word.length)));
};

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
const camel = (parts: readonly string[]): string =>
  parts.map((word, index) => (index === 0 ? word.toLowerCase() : capital(word))).join("");
const pascal = (parts: readonly string[]): string => parts.map(capital).join("");
const kebab = (parts: readonly string[]): string => parts.map((word) => word.toLowerCase()).join("-");
const acronyms: Readonly<Record<string, string>> = { id: "ID", ids: "IDs", url: "URL" };
const display = (parts: readonly string[]): string =>
  parts.map((word) => acronyms[word] ?? (word === word.toLowerCase() ? capital(word) : word)).join(" ");
const pluralWord = (word: string): string =>
  /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies`
    : /(s|x|z|ch|sh)$/i.test(word) ? `${word}es`
      : `${word}s`;
const plural = (parts: readonly string[]): string[] =>
  parts.length === 0 ? parts.slice() : [...parts.slice(0, -1), pluralWord(parts[parts.length - 1]!)];

/** Names `@osdk/maker` rejects for objects and properties, compared case-insensitively. */
const reservedNames = new Set([
  "ontology", "object", "property", "link", "relation", "rid", "primarykey", "typeid", "ontologyobject",
]);

const claim = (taken: Set<string>, base: string): string => {
  let name = base;
  for (let suffix = 2; taken.has(name.toLowerCase()); suffix += 1) name = `${base}${suffix}`;
  taken.add(name.toLowerCase());
  return name;
};

type FoundryPropertyType = "string" | "double" | "boolean" | "timestamp";

interface PropertyPlan {
  readonly apiName: string;
  readonly displayName: string;
  readonly type: FoundryPropertyType;
  readonly array: boolean;
  readonly valueType: OntologyValueTypeIR;
  readonly localName: readonly string[];
}

interface ObjectPlan {
  readonly apiName: string;
  readonly displayName: string;
  readonly pluralDisplayName: string;
  readonly description?: string;
  readonly primaryKey: string;
  readonly title: string;
  readonly properties: readonly PropertyPlan[];
  readonly byKey: ReadonlyMap<string, PropertyPlan>;
}

interface LinkPlan {
  readonly variable: string;
  readonly definition: Literal;
}

interface RelationPlan {
  readonly link: LinkType;
  readonly intermediary?: ObjectPlan;
}

type LinkType = LinkTypeIR & { readonly variable: string };

const foundryType = (valueType: OntologyValueTypeIR): FoundryPropertyType => {
  switch (valueType.kind) {
    case "number":
      return "double";
    case "boolean":
      return "boolean";
    case "datetime":
      return "timestamp";
    default:
      return "string";
  }
};

const objectRef = (object: ObjectPlan): Code => code(`${object.apiName}.apiName`);

const staticValue = (property: PropertyPlan, value: string | number | boolean | null): Literal => {
  if (value === null) return { type: "null", null: {} };
  switch (property.type) {
    case "string":
      return typeof value === "string" ? { type: "string", string: value } : undefined;
    case "double":
      return typeof value === "number" ? { type: "double", double: value } : undefined;
    case "boolean":
      return typeof value === "boolean" ? { type: "boolean", boolean: value } : undefined;
    case "timestamp":
      if (typeof value === "number") return { type: "timestamp", timestamp: new Date(value).toISOString() };
      return typeof value === "string" ? { type: "timestamp", timestamp: value } : undefined;
  }
};

/** Compile an ontology to `@osdk/maker` source. Unsupported features become diagnostics. */
export const compileOsdkMaker = (ir: OntologyIR): OsdkMakerModule => {
  const diagnostics: FoundryDiagnostic[] = [];
  const warn = (declaration: string, message: string): void => {
    diagnostics.push({ severity: "warning", declaration, message });
  };

  const objectNames = new Set<string>();
  const sideNames = new Map<string, Set<string>>();
  const claimSide = (object: ObjectPlan, base: string): string => {
    const taken = sideNames.get(object.apiName) ?? new Set<string>();
    sideNames.set(object.apiName, taken);
    return claim(taken, base);
  };

  const planObject = (
    declaration: string,
    apiName: string,
    parts: readonly string[],
    properties: readonly PropertyIR[],
    extra: readonly { readonly apiName: string; readonly displayName: string; readonly target: string }[],
    description?: string,
  ): ObjectPlan => {
    const taken = new Set<string>(extra.map(({ apiName: name }) => name.toLowerCase()));
    const byKey = new Map<string, PropertyPlan>();
    const planned = properties.map((property): PropertyPlan => {
      const local = words(property.name);
      const isRef = property.valueType.kind === "ref";
      const many = property.cardinality === "many";
      const base = isRef ? [...local, many ? "ids" : "id"] : local;
      let name = camel(base);
      if (reservedNames.has(name.toLowerCase()) || taken.has(name.toLowerCase())) {
        name = camel([...words(property.key.slice(1, property.key.indexOf("/"))), ...base]);
      }
      if (property.valueType.kind === "json") {
        warn(declaration, `Property ${property.key} is Json; it compiles to a string holding JSON text`);
      }
      if (isRef && many) {
        warn(declaration, `Property ${property.key} holds many references; it compiles to an array of ids without a link type`);
      }
      const plan: PropertyPlan = {
        apiName: claim(taken, name),
        displayName: display(base),
        type: foundryType(property.valueType),
        array: many,
        valueType: property.valueType,
        localName: local,
      };
      byKey.set(property.key, plan);
      return plan;
    });
    const primaryKey = claim(taken, taken.has("id") ? camel([...parts, "id"]) : "id");
    const fixed = extra.map((item): PropertyPlan => ({
      apiName: item.apiName,
      displayName: item.displayName,
      type: "string",
      array: false,
      valueType: { kind: "ref", target: item.target },
      localName: words(item.apiName),
    }));
    const titleCandidates = planned.filter(({ valueType, array }) => valueType.kind === "string" && !array);
    const requiredTitle = titleCandidates.find((plan) =>
      properties.find((property) => byKey.get(property.key) === plan)?.required === true);
    return {
      apiName,
      displayName: display(parts),
      pluralDisplayName: display(plural(parts)),
      ...(description === undefined ? {} : { description }),
      primaryKey,
      title: (requiredTitle ?? titleCandidates[0])?.apiName ?? primaryKey,
      properties: [
        { apiName: primaryKey, displayName: "ID", type: "string", array: false, valueType: { kind: "string" }, localName: ["id"] },
        ...fixed,
        ...planned,
      ],
      byKey,
    };
  };

  const claimObjectName = (declaration: string, base: string): string => {
    const name = reservedNames.has(base.toLowerCase()) ? `${base}Type` : base;
    if (name !== base) warn(declaration, `${base} is reserved in Foundry; it compiles to ${name}`);
    return claim(objectNames, name);
  };

  const objectWords = new Map(ir.objectTypes.map((object) => [object.name, entityWords(object)]));
  const objects = new Map<string, ObjectPlan>();
  for (const object of ir.objectTypes) {
    objects.set(object.name, planObject(
      object.name,
      claimObjectName(object.name, object.name),
      objectWords.get(object.name)!,
      object.properties,
      [],
      object.description,
    ));
  }

  const linkIds = new Set<string>(ir.linkTypes.map(({ name }) => kebab(words(name))));
  const claimLinkId = (parts: readonly string[]): string => claim(linkIds, kebab(parts));
  const linkVariable = (id: string): string => `${camel(words(id))}Link`;
  const links: LinkPlan[] = [];

  const foreignKeyLink = (
    id: string,
    one: ObjectPlan,
    many: ObjectPlan,
    property: PropertyPlan,
    oneSide: string,
    manySide: readonly string[],
    manyDisplay: readonly string[] = manySide,
  ): string => {
    const variable = linkVariable(id);
    links.push({
      variable,
      definition: {
        apiName: id,
        one: {
          object: code(one.apiName),
          metadata: {
            apiName: claimSide(one, oneSide),
            displayName: many.displayName,
            pluralDisplayName: many.pluralDisplayName,
          },
        },
        toMany: {
          object: code(many.apiName),
          metadata: {
            apiName: claimSide(many, camel(manySide)),
            displayName: display(manyDisplay),
            pluralDisplayName: display(plural(manyDisplay)),
          },
        },
        manyForeignKeyProperty: property.apiName,
      },
    });
    return variable;
  };

  for (const object of ir.objectTypes) {
    const source = objects.get(object.name)!;
    const references = object.properties.filter(
      (property) => property.valueType.kind === "ref" && property.cardinality === "one",
    );
    for (const property of references) {
      const valueType = property.valueType as { readonly kind: "ref"; readonly target: string };
      const target = objects.get(valueType.target)!;
      const plan = source.byKey.get(property.key)!;
      const siblings = references.filter((other) =>
        (other.valueType as { readonly target: string }).target === valueType.target).length;
      const sourceWords = objectWords.get(object.name)!;
      const oneSide = camel(siblings > 1 ? [...plan.localName, ...plural(sourceWords)] : plural(sourceWords));
      foreignKeyLink(claimLinkId([...sourceWords, ...plan.localName]), target, source, plan, oneSide, plan.localName);
    }
  }

  const relations = new Map<string, RelationPlan>();
  for (const link of ir.linkTypes) {
    const parts = words(link.name);
    const id = kebab(parts);
    const from = objects.get(link.from)!;
    const to = objects.get(link.to)!;
    const fromWords = objectWords.get(link.from)!;
    const toWords = objectWords.get(link.to)!;
    const variable = linkVariable(id);
    const toMetadata = {
      apiName: claimSide(from, camel(parts)),
      displayName: to.displayName,
      pluralDisplayName: to.pluralDisplayName,
    };
    const fromMetadata = {
      apiName: claimSide(to, camel([...parts, ...plural(fromWords)])),
      displayName: from.displayName,
      pluralDisplayName: from.pluralDisplayName,
    };
    if (link.properties.length === 0) {
      relations.set(link.name, { link: { ...link, variable } });
      links.push({
        variable,
        definition: {
          apiName: id,
          many: { object: code(from.apiName), metadata: toMetadata },
          toMany: { object: code(to.apiName), metadata: fromMetadata },
        },
      });
      continue;
    }
    const intermediary = planObject(
      link.name,
      claimObjectName(link.name, pascal([...parts, "link"])),
      [...parts, "link"],
      link.properties,
      [
        { apiName: "fromId", displayName: `${from === to ? "From " : ""}${from.displayName} ID`, target: link.from },
        { apiName: "toId", displayName: `${from === to ? "To " : ""}${to.displayName} ID`, target: link.to },
      ],
      link.description,
    );
    objects.set(`link:${link.name}`, intermediary);
    const fromLink = foreignKeyLink(
      claimLinkId([...parts, "from"]), from, intermediary,
      intermediary.properties.find(({ apiName }) => apiName === "fromId")!,
      camel([...parts, "links"]), ["from"], fromWords,
    );
    const toLink = foreignKeyLink(
      claimLinkId([...parts, "to"]), to, intermediary,
      intermediary.properties.find(({ apiName }) => apiName === "toId")!,
      camel([...parts, "incoming", "links"]), ["to"], toWords,
    );
    relations.set(link.name, { link: { ...link, variable }, intermediary });
    links.push({
      variable,
      definition: {
        apiName: id,
        many: { object: code(from.apiName), metadata: toMetadata, linkToIntermediary: code(fromLink) },
        toMany: { object: code(to.apiName), metadata: fromMetadata, linkToIntermediary: code(toLink) },
        intermediaryObjectType: code(intermediary.apiName),
      },
    });
  }

  const ownerOf = (key: string): ObjectPlan | undefined => {
    const owner = ir.objectTypes.find(({ properties }) => properties.some((property) => property.key === key));
    return owner === undefined ? undefined : objects.get(owner.name);
  };

  const compileAction = (action: ActionTypeIR): Literal => {
    const objectUses = new Map<string, ObjectPlan[]>();
    const valueUses = new Set<string>();
    const useObject = (value: ActionValueIR, object: ObjectPlan | undefined) => {
      if (typeof value !== "object" || value === null || value.kind !== "input" || object === undefined) return;
      objectUses.set(value.name, [...(objectUses.get(value.name) ?? []), object]);
    };
    const useValue = (value: ActionValueIR, property: PropertyPlan | undefined) => {
      if (typeof value !== "object" || value === null || value.kind !== "input") return;
      if (property?.valueType.kind === "ref" && !property.array) {
        useObject(value, objects.get(property.valueType.target));
      } else valueUses.add(value.name);
    };
    for (const change of action.changes) {
      if (change.kind === "create-object") {
        const object = objects.get(change.objectType)!;
        useValue(change.id, undefined);
        for (const [key, value] of Object.entries(change.properties)) useValue(value, object.byKey.get(key));
      } else if (change.kind === "set-property" || change.kind === "clear-property") {
        const owner = ownerOf(change.property);
        useObject(change.object, owner);
        if (change.kind === "set-property") useValue(change.value, owner?.byKey.get(change.property));
      } else {
        const relation = relations.get(change.linkType)!;
        useObject(change.from, objects.get(relation.link.from));
        useObject(change.to, objects.get(relation.link.to));
        const target = relation.intermediary;
        for (const [key, value] of Object.entries(change.properties)) useValue(value, target?.byKey.get(key));
      }
    }

    const parameterIds = new Map<string, string>();
    const parameterObjects = new Map<string, ObjectPlan>();
    const takenParameters = new Set<string>();
    const parameters = action.input.map((input: ActionInputIR): Literal => {
      const id = claim(takenParameters, /^[A-Za-z][A-Za-z0-9_]*$/.test(input.name) ? input.name : camel(words(input.name)));
      parameterIds.set(input.name, id);
      const declared = input.valueType.kind === "ref" ? objects.get(input.valueType.target) : undefined;
      const uses = [...(declared === undefined ? [] : [declared]), ...(objectUses.get(input.name) ?? [])];
      const object = valueUses.has(input.name) ? undefined : uses[0];
      if (object !== undefined && uses.some((other) => other !== object)) {
        warn(action.name, `Input ${input.name} refers to more than one object type; it compiles to a ${object.apiName} reference`);
      }
      const many = input.cardinality === "many";
      let type: Literal;
      let allowedValues: Literal;
      if (object !== undefined) {
        parameterObjects.set(input.name, object);
        const kind = many ? "objectReferenceList" : "objectReference";
        type = { type: kind, [kind]: { objectTypeId: objectRef(object) } };
        allowedValues = { type: "objectQuery" };
      } else {
        const scalar = input.valueType.kind === "number" ? "double"
          : input.valueType.kind === "boolean" ? "boolean"
            : input.valueType.kind === "datetime" ? "timestamp"
              : "string";
        type = many ? `${scalar}List` : scalar;
        allowedValues = {
          type: scalar === "double" ? "range" : scalar === "timestamp" ? "datetime" : scalar === "boolean" ? "boolean" : "text",
        };
      }
      return {
        id,
        displayName: display(words(input.name)),
        type,
        validation: { required: input.optional !== true, allowedValues },
      };
    });

    type RuleValues = Map<string, Literal>;
    type Rule =
      | { readonly kind: "add"; readonly object: ObjectPlan; readonly values: RuleValues }
      | { readonly kind: "modify"; readonly parameter: string; readonly values: RuleValues }
      | { readonly kind: "link"; readonly link: string; readonly from: string; readonly to: string };
    const rules: Rule[] = [];
    const created = new Map<string, Extract<Rule, { kind: "add" }>>();
    const modified = new Map<string, Extract<Rule, { kind: "modify" }>>();
    const affectedObjects = new Set<ObjectPlan>();
    const affectedLinks = new Set<string>();

    const ruleValue = (value: ActionValueIR, property: PropertyPlan, context: string): Literal => {
      if (typeof value === "object" && value !== null) {
        if (value.kind === "now") return { type: "currentTime", currentTime: {} };
        const parameterId = parameterIds.get(value.name)!;
        const object = parameterObjects.get(value.name);
        return object === undefined
          ? { type: "parameterId", parameterId }
          : { type: "objectParameterPropertyValue", objectParameterPropertyValue: { parameterId, propertyTypeId: object.primaryKey } };
      }
      const literal = staticValue(property, value);
      if (literal === undefined) warn(action.name, `${context} has a literal that does not match its ${property.type} property; it was left out`);
      return literal === undefined ? undefined : { type: "staticValue", staticValue: literal };
    };
    const assign = (values: RuleValues, property: PropertyPlan | undefined, value: ActionValueIR | "clear", context: string) => {
      if (property === undefined) return;
      if (property.array) {
        warn(action.name, `${context} writes many-valued ${property.apiName}; Foundry replaces whole arrays, so it was left out`);
        return;
      }
      const compiled = value === "clear"
        ? { type: "staticValue", staticValue: { type: "null", null: {} } }
        : ruleValue(value, property, context);
      if (compiled !== undefined) values.set(property.apiName, compiled);
    };
    const inputName = (value: ActionValueIR): string | undefined =>
      typeof value === "object" && value !== null && value.kind === "input" ? value.name : undefined;

    for (const change of action.changes) {
      if (change.kind === "create-object") {
        const object = objects.get(change.objectType)!;
        const values: RuleValues = new Map();
        const id = typeof change.id === "object" && change.id !== null && change.id.kind === "now"
          ? undefined
          : ruleValue(change.id, object.properties[0]!, `create ${change.objectType}`);
        values.set(object.primaryKey, id ?? { type: "uniqueIdentifier", uniqueIdentifier: {} });
        for (const [key, value] of Object.entries(change.properties)) {
          assign(values, object.byKey.get(key), value, `create ${change.objectType}`);
        }
        const rule = { kind: "add" as const, object, values };
        const name = inputName(change.id);
        if (name !== undefined) created.set(name, rule);
        affectedObjects.add(object);
        rules.push(rule);
      } else if (change.kind === "set-property" || change.kind === "clear-property") {
        const verb = change.kind === "set-property" ? "set" : "clear";
        const context = `${verb} ${change.property}`;
        const owner = ownerOf(change.property);
        const name = inputName(change.object);
        const value = change.kind === "set-property" ? change.value : "clear";
        const target = name === undefined ? undefined : created.get(name);
        if (target !== undefined) {
          assign(target.values, target.object.byKey.get(change.property), value, context);
        } else if (name !== undefined && parameterObjects.has(name) && owner !== undefined) {
          let rule = modified.get(name);
          if (rule === undefined) {
            rule = { kind: "modify", parameter: parameterIds.get(name)!, values: new Map() };
            modified.set(name, rule);
            rules.push(rule);
          }
          affectedObjects.add(owner);
          assign(rule.values, owner.byKey.get(change.property), value, context);
        } else {
          warn(action.name, `${context} does not target an object parameter; it was left out`);
        }
      } else {
        const relation = relations.get(change.linkType)!;
        const context = `link ${change.linkType}`;
        if (relation.intermediary !== undefined) {
          const object = relation.intermediary;
          const values: RuleValues = new Map([[object.primaryKey, { type: "uniqueIdentifier", uniqueIdentifier: {} }]]);
          assign(values, object.properties.find(({ apiName }) => apiName === "fromId"), change.from, context);
          assign(values, object.properties.find(({ apiName }) => apiName === "toId"), change.to, context);
          for (const [key, value] of Object.entries(change.properties)) assign(values, object.byKey.get(key), value, context);
          affectedObjects.add(object);
          rules.push({ kind: "add", object, values });
          continue;
        }
        const from = inputName(change.from);
        const to = inputName(change.to);
        if (from === undefined || to === undefined || !parameterObjects.has(from) || !parameterObjects.has(to) ||
          created.has(from) || created.has(to)) {
          warn(action.name, `${context} needs two existing object parameters; it was left out`);
          continue;
        }
        affectedLinks.add(relation.link.variable);
        rules.push({ kind: "link", link: relation.link.variable, from: parameterIds.get(from)!, to: parameterIds.get(to)! });
      }
    }

    if (rules.length === 0) {
      warn(action.name, "No change compiles to a Foundry logic rule; the action was left out");
      return undefined;
    }
    const valuesLiteral = (values: RuleValues): Literal => Object.fromEntries(values);
    return {
      apiName: kebab(words(action.name)),
      displayName: display(words(action.name)),
      description: action.description,
      status: "active",
      parameters,
      rules: rules.map((rule): Literal => {
        switch (rule.kind) {
          case "add":
            return {
              type: "addObjectRule",
              addObjectRule: { objectTypeId: objectRef(rule.object), propertyValues: valuesLiteral(rule.values), structFieldValues: {} },
            };
          case "modify":
            return {
              type: "modifyObjectRule",
              modifyObjectRule: { objectToModify: rule.parameter, propertyValues: valuesLiteral(rule.values), structFieldValues: {} },
            };
          case "link":
            return {
              type: "addLinkRule",
              addLinkRule: { linkTypeId: code(`${rule.link}.apiName`), sourceObject: rule.from, targetObject: rule.to },
            };
        }
      }),
      entities: {
        affectedInterfaceTypes: [],
        affectedObjectTypes: [...affectedObjects].map(objectRef),
        affectedLinkTypes: [...affectedLinks].map((link) => code(`${link}.apiName`)),
        typeGroups: [],
      },
    };
  };

  const actions = ir.actionTypes.flatMap((action) => {
    const definition = compileAction(action);
    return definition === undefined ? [] : [{ variable: `${camel(words(action.name))}Action`, definition }];
  });
  for (const query of ir.queryTypes) {
    warn(query.name, "Datalog queries have no Ontology as Code equivalent; it was left out");
  }

  const statements = [
    ...[...objects.values()].map((object) => `export const ${object.apiName} = defineObject(${render({
      apiName: object.apiName,
      displayName: object.displayName,
      pluralDisplayName: object.pluralDisplayName,
      description: object.description,
      primaryKeyPropertyApiName: object.primaryKey,
      titlePropertyApiName: object.title,
      properties: Object.fromEntries(object.properties.map((property) => [property.apiName, {
        type: property.type,
        ...(property.array ? { array: true } : {}),
        displayName: property.displayName,
      }])),
    })});`),
    ...links.map((link) => `export const ${link.variable} = defineLink(${render(link.definition)});`),
    ...actions.map((action) => `export const ${action.variable} = defineAction(${render(action.definition)});`),
  ];
  const imports = [
    ...(actions.length > 0 ? ["defineAction"] : []),
    ...(links.length > 0 ? ["defineLink"] : []),
    ...(objects.size > 0 ? ["defineObject"] : []),
  ];
  const header = [
    `// Generated by Open Ontology from ${ir.name}@${ir.version}. Regenerate instead of editing.`,
    "// Best-effort @osdk/maker source for Palantir Foundry Ontology as Code; see docs/foundry.md.",
    ...(diagnostics.length === 0 ? [] : [
      "//",
      "// Not compiled as modeled:",
      ...diagnostics.map(({ declaration, message }) => `// - ${declaration}: ${message}`),
    ]),
  ];
  const source = [
    header.join("\n"),
    ...(imports.length === 0 ? [] : [`import { ${imports.join(", ")} } from "@osdk/maker";`]),
    ...statements,
  ].join("\n\n");
  return { source: `${source}\n`, diagnostics };
};
