import type {
  DatalogQuery,
  NotClause,
  PatternClause,
  PredicateClause,
  PredicateOp,
} from "@triplex-build/triplex";
import type { Schema } from "effect";
import type {
  EntityQuerySource,
  OntologyEntityId,
  PropertyDefinition,
  PropertyOwner,
  PropertyQueryValue,
  QueryTypeDefinition,
} from "./model.js";

declare const queryResultType: unique symbol;
declare const queryVariableType: unique symbol;
declare const queryClauseType: unique symbol;

type DatalogScalar = string | number | boolean;
type AnyProperty = PropertyDefinition<any, any>;
type AnyVariable = QueryVariable<`?${string}`, any>;
type TypedPatternClause = PatternClause & { readonly [queryClauseType]: "pattern" };
type TypedPredicateClause = PredicateClause & { readonly [queryClauseType]: "predicate" };
type TypedNotClause = NotClause & { readonly [queryClauseType]: "not" };
type TypedClause = TypedPatternClause | TypedPredicateClause | TypedNotClause;

/** A Datalog variable whose value type exists only to help TypeScript authoring. */
export type QueryVariable<Name extends `?${string}`, Value> = Name & {
  readonly [queryVariableType]: {
    readonly name: Name;
    readonly value: (_: Value) => Value;
  };
};

type VariableValue<Variable> = Variable extends {
  readonly [queryVariableType]: { readonly value: (_: infer Value) => any };
}
  ? Value
  : never;

type VariableName<Variable> = Variable extends {
  readonly [queryVariableType]: { readonly name: infer Name };
}
  ? Extract<Name, `?${string}`>
  : never;

/** Triplex returns entity ids as strings and instants as epoch milliseconds. */
type PublicQueryValue<Value> =
  Value extends OntologyEntityId<any> ? string : Value extends Date ? number : Value;

type PlainString = string & { readonly [queryVariableType]?: never };
type QueryConstant<Value> =
  Value extends OntologyEntityId<any>
    ? PlainString
    : Value extends string
      ? PlainString
      : Extract<Value, Exclude<DatalogScalar, string>>;

export type QueryTerm<Value> = QueryVariable<`?${string}`, Value> | QueryConstant<Value>;

type SourceValue<Source> =
  Source extends EntityQuerySource<infer Identity>
    ? OntologyEntityId<Identity>
    : Source extends Schema.Schema<infer Value>
      ? Value
      : never;

export type QueryVariableSource = EntityQuerySource<any> | Schema.Schema<any>;

export type QueryVariables<Sources extends Readonly<Record<string, QueryVariableSource>>> = {
  readonly [Name in keyof Sources]: Name extends string
    ? QueryVariable<`?${Name}`, SourceValue<Sources[Name]>>
    : never;
};

type EntityTerm<Owner> = QueryVariable<`?${string}`, OntologyEntityId<Owner>> | PlainString;

type ResultRow<Find extends readonly AnyVariable[]> = {
  readonly [Variable in Find[number] as VariableName<Variable>]: PublicQueryValue<
    VariableValue<Variable>
  >;
};

/** A normal Triplex query carrying an erased result-row type. */
export type TypedDatalogQuery<Row> = DatalogQuery & {
  readonly [queryResultType]: Row;
};

export type DatalogResult<Query> =
  Query extends TypedDatalogQuery<infer Row>
    ? Row
    : Query extends QueryTypeDefinition<infer Row>
      ? Row
      : Readonly<Record<string, unknown>>;

type QueryInput<Find extends readonly AnyVariable[]> = {
  readonly find: Find;
  readonly where: readonly TypedClause[];
  readonly limit?: number;
  readonly offset?: number;
};

const variable = <const Name extends string, Source extends QueryVariableSource>(
  name: Name,
  _source: Source,
): QueryVariable<`?${Name}`, SourceValue<Source>> => {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
    throw new TypeError(`Datalog variable names must be identifiers; received ${name}`);
  }
  return `?${name}` as QueryVariable<`?${Name}`, SourceValue<Source>>;
};

const variables = <const Sources extends Readonly<Record<string, QueryVariableSource>>>(
  sources: Sources,
): QueryVariables<Sources> =>
  Object.fromEntries(
    Object.keys(sources).map((name) => [name, variable(name, sources[name]!)]),
  ) as QueryVariables<Sources>;

const match = <P extends AnyProperty>(
  entity: EntityTerm<NoInfer<PropertyOwner<P>>>,
  property: P,
  value: QueryTerm<NoInfer<PropertyQueryValue<P>>>,
): TypedPatternClause => [entity, property.key, value] as unknown as TypedPatternClause;

function predicate<Variable extends AnyVariable>(
  operator: "=" | "!=",
  left: Variable,
  right: QueryTerm<NoInfer<VariableValue<Variable>>>,
): TypedPredicateClause;
function predicate<Variable extends QueryVariable<`?${string}`, number>>(
  operator: Exclude<PredicateOp, "=" | "!=">,
  left: Variable,
  right: QueryTerm<NoInfer<VariableValue<Variable>>>,
): TypedPredicateClause;
function predicate(
  operator: PredicateOp,
  left: AnyVariable,
  right: string | number | boolean,
): TypedPredicateClause {
  return [operator, left, right] as unknown as TypedPredicateClause;
}

const not = (
  first: TypedPatternClause | TypedPredicateClause,
  ...rest: readonly (TypedPatternClause | TypedPredicateClause)[]
): TypedNotClause => ["not", first, ...rest] as unknown as TypedNotClause;

const query = <const Find extends readonly AnyVariable[]>(
  input: QueryInput<Find>,
): TypedDatalogQuery<ResultRow<Find>> =>
  ({
    ...input,
    find: [...input.find],
    where: [...input.where],
  }) as unknown as TypedDatalogQuery<ResultRow<Find>>;

/** Strip authoring-only phantom types at the Triplex serialization boundary. */
const toDatalog = <Row>(typed: TypedDatalogQuery<Row>): DatalogQuery => ({
  ...typed,
  find: [...typed.find],
  where: [...typed.where],
});

export const Datalog = {
  variable,
  variables,
  match,
  predicate,
  not,
  query,
  toDatalog,
};
