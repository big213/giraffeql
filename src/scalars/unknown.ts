import { GiraffeqlScalarType } from "../classes";

export const unknown = new GiraffeqlScalarType({
  name: "unknown",
  types: ["unknown"],
  description: "Unknown value",
});
