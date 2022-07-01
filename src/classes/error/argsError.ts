import { GiraffeqlBaseError } from "..";
export class GiraffeqlArgsError extends GiraffeqlBaseError {
  constructor(params: { message: string; fieldPath?: string[] }) {
    const { message, fieldPath } = params;
    super({
      errorName: "GiraffeqlArgsError",
      message,
      fieldPath,
      statusCode: 400,
    });
  }
}
