import { GiraffeqlBaseError } from "..";
export class GiraffeqlQueryError extends GiraffeqlBaseError {
  constructor(params: { message: string; fieldPath: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "GiraffeqlQueryError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
