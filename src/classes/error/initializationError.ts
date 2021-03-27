import { GiraffeqlBaseError } from "..";
export class GiraffeqlInitializationError extends GiraffeqlBaseError {
  constructor(params: { message: string; fieldPath?: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "GiraffeqlInitializationError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
