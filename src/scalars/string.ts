import { GiraffeqlScalarType } from "../classes";

function validate(value: unknown) {
  if (typeof value !== "string") throw true;
  return value;
}
export const string = new GiraffeqlScalarType({
  name: "string",
  types: ["string"],
  description: "String value",
  parseValue: validate,
  serialize: validate,
});
