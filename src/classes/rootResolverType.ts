import type { RootResolverDefinition } from "../types";
import { rootResolvers } from "..";
import { GiraffeqlInitializationError } from "./error/initializationError";

export class GiraffeqlRootResolverType {
  definition;
  constructor(params: RootResolverDefinition) {
    this.definition = params;

    // register this rootResolver
    if (rootResolvers.has(params.name)) {
      throw new GiraffeqlInitializationError({
        message: `GiraffeqlRootResolverType already registered for '${params.name}'`,
      });
    } else {
      rootResolvers.set(params.name, this);
    }
  }
}
