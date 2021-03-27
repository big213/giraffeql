import type { InputTypeDefinition } from "../types";
import { inputTypeDefs } from "..";
import { GiraffeqlInitializationError } from "./error/initializationError";

export class GiraffeqlInputType {
  definition;
  constructor(params: InputTypeDefinition, allowDuplicate = false) {
    this.definition = params;

    // register this typeDef
    if (inputTypeDefs.has(params.name)) {
      if (!allowDuplicate)
        throw new GiraffeqlInitializationError({
          message: `GiraffeqlInputType already registered for '${params.name}'`,
        });
    } else {
      inputTypeDefs.set(params.name, this);
    }
  }
}
