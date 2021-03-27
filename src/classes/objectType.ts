import type { ObjectTypeDefinition } from "../types";
import { objectTypeDefs } from "..";
import { GiraffeqlInitializationError } from "./error/initializationError";

export class GiraffeqlObjectType {
  definition;
  constructor(params: ObjectTypeDefinition, allowDuplicate = false) {
    this.definition = params;

    // register this typeDef
    if (objectTypeDefs.has(params.name)) {
      if (!allowDuplicate)
        throw new GiraffeqlInitializationError({
          message: `GiraffeqlObjectType already registered for '${params.name}'`,
        });
    } else {
      objectTypeDefs.set(params.name, this);
    }
  }
}
