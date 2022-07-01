import { Request, Response } from "express";
import { generateNormalResponse, generateErrorResponse } from "./response";
import {
  GiraffeqlBaseError,
  GiraffeqlQueryError,
  GiraffeqlScalarType,
} from "../classes";
import { getParams, lookupSymbol, rootResolvers } from "..";
import {
  isObject,
  validateGiraffeqlResults,
  processGiraffeqlResolverTree,
  generateGiraffeqlResolverTree,
  processError,
} from "./base";
import type { RootResolverDefinition } from "../types";

export function createRestRequestHandler(
  rootResolverObject: RootResolverDefinition,
  operationName: string
) {
  return async function (req: Request, res: Response): Promise<void> {
    try {
      const fieldPath = [operationName];

      const argsTransformer = rootResolverObject.restOptions?.argsTransformer;

      // generate args
      let args = argsTransformer
        ? await argsTransformer(req)
        : {
            ...req.query,
            ...req.params,
          };

      // if __args is object with no keys, set to undefined
      if (isObject(args) && !Object.keys(args).length) args = undefined;

      let giraffeqlQuery;

      const presetQuery = rootResolverObject.restOptions?.query;
      // if type is scalar and args !== undefined, construct query
      if (
        rootResolverObject.type instanceof GiraffeqlScalarType &&
        args !== undefined
      ) {
        giraffeqlQuery = {
          __args: args,
        };
      } else if (isObject(presetQuery)) {
        // build giraffeqlQuery
        giraffeqlQuery = {
          ...presetQuery,
          __args: args,
        };
      } else {
        giraffeqlQuery = presetQuery ?? lookupSymbol;
      }

      // validate query in-place
      const giraffeqlResolverTree = generateGiraffeqlResolverTree({
        fieldValue: giraffeqlQuery,
        resolverObject: rootResolverObject,
        fieldPath,
        fullTree: true,
        validateArgs: true,
      });

      // processes the tree
      const results = await processGiraffeqlResolverTree({
        giraffeqlResolverNode: giraffeqlResolverTree,
        req,
        fieldPath,
        fullTree: getParams().processEntireTree,
      });

      // traverse results and extract records, validate nulls, arrays, etc.
      const validatedResults = await validateGiraffeqlResults(
        results,
        giraffeqlResolverTree,
        fieldPath
      );

      sendSuccessResponse(validatedResults, res);
    } catch (err: unknown) {
      sendErrorResponse(processError(err), res);
    }
  };
}

export function createGiraffeqlRequestHandler() {
  return async function (req: Request, res: Response): Promise<void> {
    try {
      // handle giraffeql queries, check if req.body is object
      if (!isObject(req.body)) {
        throw new GiraffeqlQueryError({
          message: `Request body must be object`,
        });
      }

      // req must be an object at this point
      const requestedOperations = Object.keys(req.body);

      if (requestedOperations.length !== 1)
        throw new GiraffeqlQueryError({
          message: `Exactly 1 root query required`,
        });

      const operation = requestedOperations[0];
      const query = req.body[operation];
      const fieldPath = [operation];

      const rootResolver = rootResolvers.get(operation);

      if (!rootResolver) {
        throw new GiraffeqlQueryError({
          message: `Unrecognized giraffeql root query '${operation}'`,
        });
      }

      // validate query in-place
      const giraffeqlResolverTree = generateGiraffeqlResolverTree({
        fieldValue: query,
        resolverObject: rootResolver.definition,
        fieldPath,
        fullTree: true,
        validateArgs: true,
      });

      // processes the resolvers
      const results = await processGiraffeqlResolverTree({
        giraffeqlResolverNode: giraffeqlResolverTree,
        req,
        fieldPath,
        fullTree: getParams().processEntireTree,
      });

      // traverse results and extract records, validate nulls, arrays, etc.
      const validatedResults = await validateGiraffeqlResults(
        results,
        giraffeqlResolverTree,
        fieldPath
      );

      sendSuccessResponse(validatedResults, res);
    } catch (err: unknown) {
      sendErrorResponse(processError(err), res);
    }
  };
}

export function sendErrorResponse(err: GiraffeqlBaseError, res: Response) {
  if (getParams().debug) {
    console.log(err);
  }

  const errorResponseObject = generateErrorResponse(err);

  return res.status(err.statusCode).send(errorResponseObject);
}

export function sendSuccessResponse(results: any, res: Response) {
  const responseObject = generateNormalResponse(results);

  res.header("Content-Type", "application/json");
  res.status(200).send(responseObject);
}
