import type { Request } from "express";
import {
  GiraffeqlInputType,
  GiraffeqlScalarType,
  GiraffeqlObjectType,
  GiraffeqlInputTypeLookup,
  GiraffeqlObjectTypeLookup,
  GiraffeqlInputFieldType,
} from "../classes";

// extendable by user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Giraffeql {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface ObjectTypeDefinitionField {}
  }
}

export type StringKeyObject = { [x: string]: unknown };

export type ValidMethod =
  | "all"
  | "get"
  | "post"
  | "put"
  | "delete"
  | "patch"
  | "options"
  | "head";

export interface GiraffeqlResponse {
  data: unknown;
  error?: GiraffeqlError;
}

export interface GiraffeqlError {
  message: string;
  type: string;
  fieldPath?: string[];
  stack?: string;
}

export interface Params {
  readonly debug?: boolean;
  readonly lookupValue?: string | boolean | number | null;
  readonly route?: string;
  readonly processEntireTree?: boolean;
}

export type GiraffeqlProcessorFunction = (
  params: GiraffeqlProcessorFunctionInputs
) => Promise<unknown>;

export type GiraffeqlProcessorFunctionInputs = {
  giraffeqlResultsNode?: unknown;
  giraffeqlResolverNode: GiraffeqlResolverNode;
  parentNode?: unknown;
  req: Request;
  data?: any;
  fieldPath: string[];
  fullTree?: boolean;
};

export interface InputFieldDefinition {
  type: GiraffeqlScalarType | GiraffeqlInputType | GiraffeqlInputTypeLookup;
  required?: boolean;
  arrayOptions?: ArrayOptions;
  allowNull?: boolean;
}

export interface ArrayOptions {
  allowNullElement: boolean;
}

export interface InputTypeDefinition {
  name: string;
  description?: string;
  fields: {
    [x: string]: GiraffeqlInputFieldType;
  };
  inputsValidator?: (args: unknown, fieldPath: string[]) => void;
}

export interface ObjectTypeDefinition {
  name: string;
  description?: string;
  fields: {
    [x: string]: ObjectTypeDefinitionField;
  } & { __args?: never };
}

export interface ResolverObject {
  type: GiraffeqlObjectTypeLookup | GiraffeqlScalarType | GiraffeqlObjectType;
  arrayOptions?: ArrayOptions;
  allowNull: boolean;
  args?: GiraffeqlInputFieldType;
  description?: string;
}

export interface RootResolverDefinition extends ResolverObject {
  name: string;
  restOptions?: RestOptions;
  resolver: RootResolverFunction;
}

export interface RestOptions {
  method: ValidMethod;
  route: string;
  query?: unknown;
  argsTransformer?: (req: Request) => unknown;
}

export interface ObjectTypeDefinitionField
  extends ResolverObject,
    Giraffeql.ObjectTypeDefinitionField {
  resolver?: ResolverFunction;
  defer?: boolean;
  required?: boolean;
  hidden?: boolean;
}

// export type JsType = "string" | "number" | "boolean" | "unknown";

export interface ScalarDefinition {
  name: string;
  description?: string;
  types: string[];
  serialize?: ScalarDefinitionFunction;
  parseValue?: ScalarDefinitionFunction;
}

export type ScalarDefinitionFunction = (value: unknown) => unknown;

export interface RootResolverFunctionInput {
  req: Request;
  fieldPath: string[];
  args: unknown;
  query?: unknown;
}

export type RootResolverFunction = (
  input: RootResolverFunctionInput
) => unknown;

export interface ResolverFunctionInput {
  req: Request;
  fieldPath: string[];
  args: unknown;
  query: unknown;
  parentValue: any;
  fieldValue: unknown;
  data?: any;
}

export type ResolverFunction = (input: ResolverFunctionInput) => unknown;

export interface GiraffeqlResolverNode {
  typeDef: ObjectTypeDefinitionField | RootResolverDefinition;
  query?: unknown;
  args?: unknown;
  nested?: {
    [x: string]: GiraffeqlResolverNode;
  };
}

export type GiraffeqlResultsNode = unknown;

export function isRootResolverDefinition(
  ele: RootResolverDefinition | ObjectTypeDefinitionField
): ele is RootResolverDefinition {
  return "name" in ele;
}
