import { Request } from "express";
import { getParams, objectTypeDefs, inputTypeDefs, lookupSymbol } from "..";
import {
  GiraffeqlArgsError,
  GiraffeqlInputType,
  GiraffeqlQueryError,
  GiraffeqlResultError,
  GiraffeqlObjectType,
  GiraffeqlScalarType,
  GiraffeqlInputTypeLookup,
  GiraffeqlObjectTypeLookup,
  GiraffeqlInputFieldType,
  GiraffeqlBaseError,
  GiraffeqlRootResolverType,
} from "../classes";

import {
  GiraffeqlResolverNode,
  ResolverObject,
  RootResolverDefinition,
  GiraffeqlProcessorFunction,
  ObjectTypeDefinitionField,
  isRootResolverDefinition,
  ArrayOptions,
  StringKeyObject,
} from "../types";

export function isObject(ele: unknown): ele is StringKeyObject {
  return Object.prototype.toString.call(ele) === "[object Object]";
}

export function processError(err: unknown, fieldPath?: string[]) {
  if (err instanceof GiraffeqlBaseError) {
    // only set fieldPath if it is defined and if it was not already set
    if (fieldPath && !err.fieldPath) err.fieldPath = fieldPath;
    return err;
  } else if (err instanceof Error) {
    return new GiraffeqlBaseError({
      message: err.message,
      fieldPath,
    });
  } else {
    return new GiraffeqlBaseError({
      fieldPath,
    });
  }
}

// validates and replaces the args, returns the validated args
export function validateExternalArgs(
  args: unknown,
  argDefinition: GiraffeqlInputFieldType | undefined,
  fieldPath: string[]
): unknown {
  try {
    let parsedArgs;

    // if no argDefinition and args provided, throw error
    if (!argDefinition) {
      if (args)
        throw new GiraffeqlArgsError({
          message: `Not expecting any args`,
        });
      else return;
    }

    // if no arg required and args is undefined, return
    if (!argDefinition.definition.required && args === undefined) return;

    // if argDefinition.required and args is undefined, throw err
    if (argDefinition.definition.required && args === undefined)
      throw new GiraffeqlArgsError({
        message: `Args is required`,
      });

    // if !argDefinition.allowNull and args is null, throw err
    if (!argDefinition.definition.allowNull && args === null)
      throw new GiraffeqlArgsError({
        message: `Null field is not allowed`,
      });

    // if array field
    if (argDefinition.definition.arrayOptions) {
      // if allowNull and not array, must be null
      if (
        argDefinition.definition.allowNull &&
        !Array.isArray(args) &&
        args !== null
      ) {
        throw new GiraffeqlArgsError({
          message: `Field must be Array or null`,
        });
      }

      // if !allowNull and not array, throw err
      if (!argDefinition.definition.allowNull && !Array.isArray(args))
        throw new GiraffeqlArgsError({
          message: `Array expected`,
        });
    }

    let argDefType = argDefinition.definition.type;

    // // if lookup field, convert from map
    if (argDefType instanceof GiraffeqlInputTypeLookup) {
      const inputDef = inputTypeDefs.get(argDefType.name);
      if (!inputDef)
        throw new GiraffeqlArgsError({
          message: `Unknown inputDef '${argDefType.name}'`,
        });
      argDefType = inputDef;
    }

    // if argDefinition.type is inputTypeDefinition
    if (argDefType instanceof GiraffeqlInputType) {
      let argsArray: unknown[];
      const fields = argDefType.definition.fields;
      // if args is array and it is supposed to be array, process each array element
      if (Array.isArray(args) && argDefinition.definition.arrayOptions) {
        // if !allowNullElements and there is a null element, throw err
        if (
          !argDefinition.definition.arrayOptions.allowNullElement &&
          args.some((ele) => ele === null)
        ) {
          throw new GiraffeqlArgsError({
            message: `Null field is not allowed on array element`,
          });
        }
        argsArray = args;
      } else {
        argsArray = [args];
      }

      // process all args
      for (const arg of argsArray) {
        if (!isObject(arg)) {
          if (argDefinition.definition.allowNull && arg !== null) {
            throw new GiraffeqlArgsError({
              message: `Object or null expected`,
            });
          }

          if (!argDefinition.definition.allowNull) {
            throw new GiraffeqlArgsError({
              message: `Object expected`,
            });
          }
        }

        // if arg is null and allowed to be null, do nothing
        if (isObject(arg)) {
          const keysToValidate = new Set(Object.keys(arg));
          Object.entries(fields).forEach(([key, argDef]) => {
            // validate each key of arg
            const validatedArg = validateExternalArgs(
              arg[key],
              argDef,
              fieldPath.concat(key)
            );
            // if key is undefined, make sure it is deleted
            if (validatedArg === undefined) delete arg[key];
            else {
              arg[key] = validatedArg;
            }
            keysToValidate.delete(key);
          });

          // check if any remaining keys to validate (aka unknown args)
          if (keysToValidate.size > 0) {
            throw new GiraffeqlArgsError({
              message: `Unknown args '${[...keysToValidate].join(",")}'`,
            });
          }

          // perform validation on results
          if (argDefType.definition.inputsValidator) {
            argDefType.definition.inputsValidator(arg, fieldPath);
          }
        }
      }
    } else {
      // if argDefinition.type is scalarDefinition, attempt to parseValue args
      // replace value if parseValue
      const parseValue = argDefType.definition.parseValue;

      // if arg is null, skip
      if (parseValue && args !== null) {
        try {
          // if arg is an array and supposed to be array, loop through
          if (Array.isArray(args) && argDefinition.definition.arrayOptions) {
            parsedArgs = args.map((ele: unknown) => parseValue(ele));
          } else {
            parsedArgs = parseValue(args);
          }
        } catch {
          // transform any errors thrown into GiraffeqlParseError
          throw new GiraffeqlArgsError({
            message: `Invalid scalar value for '${argDefType.definition.name}'`,
          });
        }
      }
    }

    /*
    // if an argsValidator function is available, also run that
    if (argDefinition.argsValidator) {
      argDefinition.argsValidator(parsedArgs, fieldPath);
    }
    */
    return parsedArgs ?? args;
  } catch (err) {
    throw processError(err, fieldPath);
  }
}

// traverses results according to GiraffeqlResolverTree and validates nulls, arrays, extracts results from objs
export async function validateGiraffeqlResults(
  giraffeqlResultsNode: unknown,
  giraffeqlResolverNode: GiraffeqlResolverNode,
  fieldPath: string[]
): Promise<unknown> {
  try {
    const nested = giraffeqlResolverNode.nested;

    if (nested) {
      // if output is null, cut the tree short and return
      if (giraffeqlResultsNode === null) {
        // but first, check if null is allowed. if not, throw err
        if (!giraffeqlResolverNode.typeDef.allowNull) {
          throw new GiraffeqlResultError({
            message: `Null output not allowed`,
          });
        }

        return null;
      }
      if (giraffeqlResolverNode.typeDef.arrayOptions) {
        if (Array.isArray(giraffeqlResultsNode)) {
          return Promise.all(
            giraffeqlResultsNode.map(async (ele) => {
              const arrReturnValue: StringKeyObject = {};
              for (const field in giraffeqlResolverNode.nested) {
                arrReturnValue[field] = await validateGiraffeqlResults(
                  ele[field],
                  giraffeqlResolverNode.nested[field],
                  fieldPath.concat(field)
                );
              }
              return arrReturnValue;
            })
          );
        } else {
          // if field is not Array or null, throw err
          throw new GiraffeqlResultError({
            message: `Expecting array or null`,
          });
        }
      } else {
        const tempReturnValue: StringKeyObject = {};
        // if no nested fields requested, return empty object
        if (
          giraffeqlResolverNode.nested &&
          Object.keys(giraffeqlResolverNode.nested).length < 1
        ) {
          return isObject(giraffeqlResultsNode) ? tempReturnValue : null;
        }

        if (!isObject(giraffeqlResultsNode))
          throw new GiraffeqlResultError({
            message: `Expecting object`,
          });

        for (const field in giraffeqlResolverNode.nested) {
          tempReturnValue[field] = await validateGiraffeqlResults(
            giraffeqlResultsNode[field],
            giraffeqlResolverNode.nested[field],
            fieldPath.concat(field)
          );
        }
        return tempReturnValue;
      }
    } else {
      // check for nulls and ensure array fields are arrays
      validateResultFields(
        giraffeqlResultsNode,
        giraffeqlResolverNode.typeDef,
        fieldPath
      );

      // if typeDef of field is ScalarDefinition, apply the serialize function to the end result
      let fieldType = giraffeqlResolverNode.typeDef.type;

      if (fieldType instanceof GiraffeqlObjectTypeLookup) {
        const typeDef = objectTypeDefs.get(fieldType.name);
        if (!typeDef) {
          throw new GiraffeqlQueryError({
            message: `TypeDef '${fieldType.name}' not found`,
          });
        }
        fieldType = typeDef;
      }

      if (fieldType instanceof GiraffeqlObjectType) {
        return giraffeqlResultsNode;
      } else {
        const serializeFn = fieldType.definition.serialize;
        // if field is null, skip
        if (
          serializeFn &&
          giraffeqlResultsNode !== null &&
          giraffeqlResultsNode !== undefined
        ) {
          try {
            if (
              Array.isArray(giraffeqlResultsNode) &&
              giraffeqlResolverNode.typeDef.arrayOptions
            ) {
              const allowNullElement = giraffeqlResolverNode.typeDef
                .arrayOptions!.allowNullElement;

              return giraffeqlResultsNode.map((ele: unknown) => {
                if (allowNullElement && ele === null) return null;

                return serializeFn(ele);
              });
            } else {
              return serializeFn(giraffeqlResultsNode);
            }
          } catch {
            // transform any errors thrown into GiraffeqlParseError
            throw new GiraffeqlResultError({
              message: `Invalid scalar value for '${fieldType.definition.name}'`,
            });
          }
        } else {
          return giraffeqlResultsNode;
        }
      }
    }
  } catch (err) {
    throw processError(err, fieldPath);
  }
}

// throws an error if a field is not an array when it should be
export function validateResultFields(
  value: unknown,
  resolverObject: ResolverObject,
  fieldPath: string[]
): void {
  try {
    if (resolverObject.arrayOptions) {
      if (Array.isArray(value)) {
        value.forEach((ele) => {
          validateResultNullish(
            ele,
            resolverObject,
            fieldPath,
            resolverObject.arrayOptions
          );
        });
      } else if (!resolverObject.allowNull) {
        throw new GiraffeqlResultError({
          message: `Array expected`,
        });
      } else if (value !== null) {
        // field must be null
        throw new GiraffeqlResultError({
          message: `Array or null expected`,
        });
      }
    } else {
      validateResultNullish(
        value,
        resolverObject,
        fieldPath,
        resolverObject.arrayOptions
      );
    }
  } catch (err) {
    throw processError(err, fieldPath);
  }
}

// throws an error if a field is nullish when it should not be
export function validateResultNullish(
  value: unknown,
  resolverObject: ResolverObject,
  fieldPath: string[],
  arrayOptions: ArrayOptions | undefined
): void {
  try {
    const isNullAllowed = arrayOptions
      ? arrayOptions.allowNullElement
      : resolverObject.allowNull;
    if ((value === null || value === undefined) && !isNullAllowed) {
      throw new GiraffeqlResultError({
        message:
          `Null value not allowed` + (arrayOptions ? " for array element" : ""),
      });
    }
  } catch (err) {
    throw processError(err, fieldPath);
  }
}

// starts generateGiraffeqlResolverTree from a TypeDef
export function generateAnonymousRootResolver(
  type: GiraffeqlObjectType | GiraffeqlObjectTypeLookup | GiraffeqlScalarType
): ObjectTypeDefinitionField {
  const anonymousRootResolver: ObjectTypeDefinitionField = {
    allowNull: true,
    type,
  };

  return anonymousRootResolver;
}

export async function generateGiraffeqlResolverTree({
  fieldValue,
  resolverObject,
  req,
  fieldPath = [],
  fullTree = false,
  validateArgs = false,
  runValidators = false,
  rootResolver,
}: {
  fieldValue: unknown;
  resolverObject: ObjectTypeDefinitionField | RootResolverDefinition;
  req: Request;
  fieldPath: string[];
  fullTree?: boolean;
  validateArgs?: boolean;
  runValidators?: boolean;
  rootResolver: GiraffeqlRootResolverType;
}): Promise<GiraffeqlResolverNode> {
  try {
    // run the validator first (if necessary)
    if (runValidators) {
      await resolverObject.validator?.({
        req,
        fieldPath,
        args: resolverObject.args,
        query: fieldValue,
        rootResolver,
      });
    }

    let fieldType = resolverObject.type;

    // if string, attempt to convert to TypeDefinition
    if (fieldType instanceof GiraffeqlObjectTypeLookup) {
      const typeDefLookup = objectTypeDefs.get(fieldType.name);
      if (!typeDefLookup) {
        throw new GiraffeqlQueryError({
          message: `TypeDef '${fieldType.name}' not found`,
        });
      }
      fieldType = typeDefLookup;
    }

    // define the lookupValue
    const lookupValue = getParams().lookupValue;

    // field must either be lookupValue OR an object
    // check if field is lookupValue
    const isLookupField =
      fieldValue === lookupValue || fieldValue === lookupSymbol;

    const isLeafNode = !(fieldType instanceof GiraffeqlObjectType);

    // field must either be lookupValue OR an object
    if (!isLookupField && !isObject(fieldValue))
      throw new GiraffeqlQueryError({
        message: `Invalid field RHS`,
      });

    // if leafNode and nested, MUST be only with __args
    if (isLeafNode && isObject(fieldValue)) {
      if (!("__args" in fieldValue) || Object.keys(fieldValue).length !== 1) {
        throw new GiraffeqlQueryError({
          message: `Scalar node can only accept __args and no other field`,
        });
      }
    }

    // if not leafNode and isLookupField, deny
    if (!isLeafNode && isLookupField)
      throw new GiraffeqlQueryError({
        message: `Resolved node must be an object with nested fields`,
      });

    // if field is scalar and args is required, and not object, throw err
    if (
      isLeafNode &&
      resolverObject.args?.definition.required &&
      !isObject(fieldValue)
    ) {
      throw new GiraffeqlQueryError({
        message: `Args required`,
      });
    }

    let nestedNodes: { [x: string]: GiraffeqlResolverNode } | null = null;

    // separate args from query
    const { __args: args = null, ...query } = isObject(fieldValue)
      ? fieldValue
      : {};

    if (isObject(fieldValue)) {
      // validate args in-place, if any
      if (validateArgs) {
        validateExternalArgs(
          fieldValue.__args,
          resolverObject.args,
          fieldPath.concat("__args")
        );
      }

      if (!isLeafNode && fieldType instanceof GiraffeqlObjectType) {
        nestedNodes = {};

        // iterate over fields
        for (const field in fieldValue) {
          const parentsPlusCurrentField = fieldPath.concat(field);
          if (field === "__args") {
            continue;
          }

          // if field not in TypeDef, reject
          if (!(field in fieldType.definition.fields)) {
            throw new GiraffeqlQueryError({
              message: `Unknown field`,
              fieldPath: parentsPlusCurrentField,
            });
          }

          // deny hidden fields
          if (fieldType.definition.fields[field].hidden) {
            throw new GiraffeqlQueryError({
              message: `Hidden field`,
              fieldPath: parentsPlusCurrentField,
            });
          }

          // only if no resolver do we recursively add to tree
          // if there is a resolver, the sub-tree should be generated in the resolver
          if (fullTree || !resolverObject.resolver)
            nestedNodes[field] = await generateGiraffeqlResolverTree({
              fieldValue: fieldValue[field],
              resolverObject: fieldType.definition.fields[field],
              fieldPath: parentsPlusCurrentField,
              fullTree,
              validateArgs,
              runValidators,
              req,
              rootResolver,
            });
        }
      }
    }
    return {
      typeDef: resolverObject,
      query,
      args,
      nested: nestedNodes ?? undefined,
    };
  } catch (err) {
    throw processError(err, fieldPath);
  }
}

// resolves the queries, and attaches them to the obj (if possible)
export const processGiraffeqlResolverTree: GiraffeqlProcessorFunction = async ({
  giraffeqlRootResolver,
  giraffeqlResultsNode,
  giraffeqlResolverNode,
  parentNode,
  req,
  fieldPath = [],
  fullTree = false,
}) => {
  try {
    let results;
    // if it is a root resolver, fetch the results first.
    if (isRootResolverDefinition(giraffeqlResolverNode.typeDef)) {
      results = await giraffeqlResolverNode.typeDef.resolver({
        req,
        fieldPath,
        args: giraffeqlResolverNode.args,
        query: giraffeqlResolverNode.query,
        rootResolver: giraffeqlRootResolver,
      });
      // if full tree not required, return here
      if (!fullTree) return results;
    } else {
      results = giraffeqlResultsNode;
    }

    const resolverFn = giraffeqlResolverNode.typeDef.resolver;
    const nested = giraffeqlResolverNode.nested;

    // if typeDef is RootResolverDefinition, skip resolving (should already be done)
    if (
      resolverFn &&
      !isRootResolverDefinition(giraffeqlResolverNode.typeDef)
    ) {
      // if defer, skip resolving
      if (giraffeqlResolverNode.typeDef.defer) {
        return null;
      }
      return resolverFn({
        req,
        fieldPath,
        args: giraffeqlResolverNode.args,
        query: giraffeqlResolverNode.query,
        fieldValue: results,
        parentValue: parentNode,
        rootResolver: giraffeqlRootResolver,
      });
    } else if (nested && isObject(results)) {
      // must be nested field.
      const tempReturnValue = results;

      for (const field in giraffeqlResolverNode.nested) {
        const currentFieldPath = fieldPath.concat(field);
        tempReturnValue[field] = await processGiraffeqlResolverTree({
          giraffeqlRootResolver,
          giraffeqlResultsNode: isObject(results) ? results[field] : null,
          parentNode: results,
          giraffeqlResolverNode: giraffeqlResolverNode.nested[field],
          req,
          fieldPath: currentFieldPath,
        });
      }
      return tempReturnValue;
    } else {
      return results;
    }
  } catch (err) {
    throw processError(err, fieldPath);
  }
};
