import type { ScalarDefinition } from "../types";
import { scalarTypeDefs } from "..";
import { GiraffeqlInitializationError } from "./error/initializationError";

export class GiraffeqlScalarType {
  definition;
  constructor(params: ScalarDefinition, allowOverride = true) {
    this.definition = params;

    // register this typeDef
    if (scalarTypeDefs.has(params.name)) {
      if (!allowOverride)
        throw new GiraffeqlInitializationError({
          message: `GiraffeqlScalarType already registered for '${params.name}'`,
        });
      else scalarTypeDefs.set(params.name, this);
    } else {
      scalarTypeDefs.set(params.name, this);
    }
  }
}
