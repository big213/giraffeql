import type { InputFieldDefinition } from "../types";

export class GiraffeqlInputFieldType {
  definition;
  constructor(params: InputFieldDefinition) {
    this.definition = params;
  }
}
