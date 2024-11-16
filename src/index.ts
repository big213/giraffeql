import type { Express } from "express";
import {
  createGiraffeqlRequestHandler,
  createRestRequestHandler,
} from "./helpers/router";

import {
  GiraffeqlInitializationError,
  GiraffeqlObjectType,
  GiraffeqlRootResolverType,
  GiraffeqlInputType,
  GiraffeqlScalarType,
} from "./classes";

import type { Params } from "./types";

export { TsSchemaGenerator } from "./classes/schema";

export { sendErrorResponse, sendSuccessResponse } from "./helpers/router";

export {
  GiraffeqlArgsError,
  GiraffeqlBaseError,
  GiraffeqlQueryError,
  GiraffeqlResultError,
  GiraffeqlInitializationError,
  GiraffeqlObjectType,
  GiraffeqlInputType,
  GiraffeqlRootResolverType,
  GiraffeqlScalarType,
  GiraffeqlInputTypeLookup,
  GiraffeqlObjectTypeLookup,
  GiraffeqlInputFieldType,
} from "./classes";

export {
  RootResolverDefinition,
  ObjectTypeDefinition,
  InputFieldDefinition,
  InputTypeDefinition,
  ScalarDefinition,
  GiraffeqlResolverNode,
  ResolverFunction,
  RootResolverFunction,
  ObjectTypeDefinitionField,
  ArrayOptions,
  isRootResolverDefinition,
  StringKeyObject,
} from "./types";

let exportedParams: Required<Params>;

// set a symbol for lookups
export const lookupSymbol = Symbol("lookup");

export const objectTypeDefs: Map<string, GiraffeqlObjectType> = new Map();
export const inputTypeDefs: Map<string, GiraffeqlInputType> = new Map();
export const scalarTypeDefs: Map<string, GiraffeqlScalarType> = new Map();

export const rootResolvers: Map<string, GiraffeqlRootResolverType> = new Map();

export function initializeGiraffeql(
  app: Express,
  {
    debug = false,
    lookupValue = true,
    route = "/giraffeql",
    processEntireTree = true,
  }: Params = {}
): void {
  // giraffeqlPath must start with '/'
  if (!route.match(/^\//)) {
    throw new GiraffeqlInitializationError({
      message: `Invalid giraffeql route`,
    });
  }

  exportedParams = {
    debug,
    lookupValue,
    route,
    processEntireTree,
  };

  app.post(route, createGiraffeqlRequestHandler());

  // populate all RESTful routes. This should only be done on cold starts.
  rootResolvers.forEach((item, key) => {
    const restOptions = item.definition.restOptions;
    if (!restOptions) return;

    if (restOptions.route === route)
      throw new GiraffeqlInitializationError({
        message: `Duplicate route for giraffeql route: '${route}'`,
      });

    app[restOptions.method](
      restOptions.route,
      createRestRequestHandler(item, key)
    );
  });

  app.set("json replacer", function (key: string, value: unknown) {
    // undefined values are set to `null`
    if (typeof value === "undefined") {
      return null;
    }
    return value;
  });
}

export function getParams(): Params {
  if (!exportedParams) {
    throw new GiraffeqlInitializationError({
      message: `Giraffeql has not been initialized yet`,
    });
  }
  return exportedParams;
}

export * as BaseScalars from "./scalars";

export {
  generateGiraffeqlResolverTree,
  processGiraffeqlResolverTree,
  validateExternalArgs,
  validateResultFields,
  generateAnonymousRootResolver,
} from "./helpers/base";
