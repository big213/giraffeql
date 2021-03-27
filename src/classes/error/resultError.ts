import { GiraffeqlBaseError } from "..";
export class GiraffeqlResultError extends GiraffeqlBaseError {
  constructor(params: { message: string; fieldPath: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "GiraffeqlResultError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
