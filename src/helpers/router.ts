import { Request, Response } from "express";
import { generateNormalResponse, generateErrorResponse } from "./response";
import {
  GiraffeqlBaseError,
  GiraffeqlQueryError,
  GiraffeqlRootResolverType,
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

export function createRestRequestHandler(
  giraffeqlRootResolver: GiraffeqlRootResolverType,
  operationName: string
) {
  const rootResolverObject = giraffeqlRootResolver.definition;
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

      // validate query in-place (and also run the validators)
      const giraffeqlResolverTree = await generateGiraffeqlResolverTree({
        fieldValue: giraffeqlQuery,
        resolverObject: rootResolverObject,
        fullTree: true,
        validateArgs: true,
        req,
        fieldPath,
        giraffeqlRootResolver,
      });

      // processes the tree
      const results = await processGiraffeqlResolverTree({
        giraffeqlRootResolver,
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
      sendErrorResponse(err, res);
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

      // validate query in-place (and also run the validators)
      const giraffeqlResolverTree = await generateGiraffeqlResolverTree({
        fieldValue: query,
        resolverObject: rootResolver.definition,
        fullTree: true,
        validateArgs: true,
        req,
        fieldPath,
        giraffeqlRootResolver: rootResolver,
      });

      // processes the resolvers
      const results = await processGiraffeqlResolverTree({
        giraffeqlRootResolver: rootResolver,
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
      sendErrorResponse(err, res);
    }
  };
}

export function sendErrorResponse(err: unknown, res: Response) {
  const validatedError = processError(err);

  if (getParams().debug) {
    console.log(err);
  }

  const errorResponseObject = generateErrorResponse(validatedError);

  return res.status(validatedError.statusCode).send(errorResponseObject);
}

export function sendSuccessResponse(results: any, res: Response) {
  const responseObject = generateNormalResponse(results);

  res.header("Content-Type", "application/json");
  res.status(200).send(responseObject);
}
